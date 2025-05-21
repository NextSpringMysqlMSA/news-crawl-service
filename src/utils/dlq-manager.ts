/**
 * Dead Letter Queue 관리 유틸리티
 * 
 * DLQ에 쌓인 메시지를 분석하고, 재처리하는 기능을 제공합니다.
 */
import { Kafka } from "kafkajs";
import type { Consumer, Producer } from "kafkajs";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
import type { DeadLetterQueueMessage, CrawlRequest } from "@/types";
import type { KafkaProducerService } from "@/services/kafka-producer";

/**
 * Dead Letter Queue 관리자 클래스
 */
export class DeadLetterQueueManager {
  private kafka: Kafka;
  private consumer: Consumer;
  private producer: Producer;
  private dlqTopic: string;
  private targetTopic: string;
  private kafkaProducer?: KafkaProducerService;

  /**
   * 생성자
   * @param dlqTopic DLQ 토픽 이름 (기본값: news-keywords.dead-letter)
   * @param targetTopic 재처리를 위한 대상 토픽 이름 (기본값: news-keywords)
   * @param kafkaProducer 기존 Kafka 프로듀서 (선택적)
   */
  constructor(
    dlqTopic?: string, 
    targetTopic?: string,
    kafkaProducer?: KafkaProducerService
  ) {
    this.dlqTopic = dlqTopic || `${env.kafka.topic}.dead-letter`;
    this.targetTopic = targetTopic || env.kafka.topic;
    this.kafkaProducer = kafkaProducer;

    this.kafka = new Kafka({
      clientId: `${env.kafka.clientId}-dlq-manager`,
      brokers: env.kafka.brokers,
    });

    this.consumer = this.kafka.consumer({
      groupId: `${env.kafka.groupId}-dlq-manager`,
      allowAutoTopicCreation: true,
    });

    this.producer = this.kafka.producer();

    logger.info(`DLQ 관리자 생성됨 (DLQ: ${this.dlqTopic}, 대상: ${this.targetTopic})`);
  }

  /**
   * 연결 초기화
   */
  async initialize(): Promise<void> {
    try {
      await this.consumer.connect();
      await this.producer.connect();
      logger.info("DLQ 관리자 연결 성공");
    } catch (error) {
      logger.error("DLQ 관리자 연결 실패", error);
      throw error;
    }
  }

  /**
   * 연결 종료
   */
  async close(): Promise<void> {
    try {
      await this.consumer.disconnect();
      await this.producer.disconnect();
      logger.info("DLQ 관리자 연결 종료됨");
    } catch (error) {
      logger.error("DLQ 관리자 연결 종료 실패", error);
    }
  }

  /**
   * DLQ 메시지 분석 및 통계 수집
   * @returns DLQ 메시지 통계
   */
  async analyzeDLQ(): Promise<{
    totalMessages: number;
    byErrorType: Record<string, number>;
    bySource: Record<string, number>;
    byStatus: Record<string, number>;
  }> {
    const stats = {
      totalMessages: 0,
      byErrorType: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
      byStatus: {} as Record<string, number>
    };

    // 기존 구독 제거
    await this.consumer.stop();
    
    try {
      await this.consumer.subscribe({ topic: this.dlqTopic, fromBeginning: true });
      
      await this.consumer.run({
        autoCommit: false,
        eachMessage: async ({ message }) => {
          const value = message.value?.toString();
          if (!value) return;
          
          try {
            const dlqMessage = JSON.parse(value) as DeadLetterQueueMessage;
            
            stats.totalMessages++;
            
            // 오류 유형별 통계
            if (!stats.byErrorType[dlqMessage.errorType]) {
              stats.byErrorType[dlqMessage.errorType] = 0;
            }
            stats.byErrorType[dlqMessage.errorType]++;
            
            // 소스별 통계
            const source = dlqMessage.source || 'unknown';
            if (!stats.bySource[source]) {
              stats.bySource[source] = 0;
            }
            stats.bySource[source]++;
            
            // 상태별 통계
            if (!stats.byStatus[dlqMessage.status]) {
              stats.byStatus[dlqMessage.status] = 0;
            }
            stats.byStatus[dlqMessage.status]++;
          } catch (error) {
            logger.error("DLQ 메시지 파싱 실패", error);
          }
        },
      });
    } finally {
      await this.consumer.stop();
    }
    
    logger.info(`DLQ 분석 결과: 총 ${stats.totalMessages}개 메시지 발견`);
    return stats;
  }

  /**
   * 특정 조건에 맞는 DLQ 메시지를 재처리 (원래 토픽으로 다시 발행)
   * @param filter 재처리할 메시지를 필터링하는 함수
   * @returns 재처리된 메시지 수
   */
  async reprocessMessages(
    filter: (message: DeadLetterQueueMessage) => boolean = () => true
  ): Promise<number> {
    let reprocessedCount = 0;
    
    // 기존 구독 제거
    await this.consumer.stop();
    
    try {
      await this.consumer.subscribe({ topic: this.dlqTopic, fromBeginning: true });
      
      await this.consumer.run({
        autoCommit: false,
        eachMessage: async ({ message }) => {
          const value = message.value?.toString();
          if (!value) return;
          
          try {
            const dlqMessage = JSON.parse(value) as DeadLetterQueueMessage;
            
            // 필터 조건에 맞는 메시지만 재처리
            if (!filter(dlqMessage)) {
              logger.debug(`ID ${dlqMessage.id} 메시지가 필터 조건에 맞지 않아 건너뜀`);
              return;
            }
            
            // 원본 요청 가져오기
            const originalRequest = dlqMessage.originalRequest;
            
            // 원래 토픽으로 메시지 재발행
            await this.producer.send({
              topic: this.targetTopic,
              messages: [{
                key: dlqMessage.id,
                value: JSON.stringify(originalRequest),
              }],
            });
            
            // 재처리 상태로 DLQ 메시지 업데이트
            const updatedMessage: DeadLetterQueueMessage = {
              ...dlqMessage,
              status: 'reprocessed',
              reprocessedAt: new Date().toISOString(),
            };
            
            // 업데이트된 DLQ 메시지 게시 (세부 상태 추적용)
            if (this.kafkaProducer) {
              await this.kafkaProducer.publishDeadLetterMessage(updatedMessage);
            }
            
            reprocessedCount++;
            logger.info(`ID ${dlqMessage.id} 메시지 재처리됨 (키워드: "${originalRequest.keyword}")`);
          } catch (error) {
            logger.error("DLQ 메시지 재처리 실패", error);
          }
        },
      });
    } finally {
      await this.consumer.stop();
    }
    
    logger.info(`총 ${reprocessedCount}개 메시지가 재처리됨`);
    return reprocessedCount;
  }

  /**
   * 특정 조건에 맞는 DLQ 메시지를 무시 표시 (더 이상 처리하지 않음)
   * @param filter 무시할 메시지를 필터링하는 함수
   * @returns 무시 표시된 메시지 수
   */
  async ignoreMessages(
    filter: (message: DeadLetterQueueMessage) => boolean = () => true
  ): Promise<number> {
    let ignoredCount = 0;
    
    // 기존 구독 제거
    await this.consumer.stop();
    
    try {
      await this.consumer.subscribe({ topic: this.dlqTopic, fromBeginning: true });
      
      await this.consumer.run({
        autoCommit: false,
        eachMessage: async ({ message }) => {
          const value = message.value?.toString();
          if (!value) return;
          
          try {
            const dlqMessage = JSON.parse(value) as DeadLetterQueueMessage;
            
            // 필터 조건에 맞는 메시지만 무시 처리
            if (!filter(dlqMessage)) {
              return;
            }
            
            // 이미 무시된 메시지는 건너뜀
            if (dlqMessage.status === 'ignored') {
              return;
            }
            
            // 무시 상태로 DLQ 메시지 업데이트
            const updatedMessage: DeadLetterQueueMessage = {
              ...dlqMessage,
              status: 'ignored',
            };
            
            // 업데이트된 DLQ 메시지 게시
            if (this.kafkaProducer) {
              await this.kafkaProducer.publishDeadLetterMessage(updatedMessage);
            }
            
            ignoredCount++;
            logger.info(`ID ${dlqMessage.id} 메시지 무시됨 (키워드: "${dlqMessage.originalRequest.keyword}")`);
          } catch (error) {
            logger.error("DLQ 메시지 무시 처리 실패", error);
          }
        },
      });
    } finally {
      await this.consumer.stop();
    }
    
    logger.info(`총 ${ignoredCount}개 메시지가 무시 처리됨`);
    return ignoredCount;
  }

  /**
   * DLQ에서 특정 ID의 메시지 조회
   * @param id 조회할 메시지 ID
   * @returns 메시지 (찾지 못하면 undefined)
   */
  async getMessageById(id: string): Promise<DeadLetterQueueMessage | undefined> {
    let foundMessage: DeadLetterQueueMessage | undefined;
    
    // 기존 구독 제거
    await this.consumer.stop();
    
    try {
      await this.consumer.subscribe({ topic: this.dlqTopic, fromBeginning: true });
      
      await this.consumer.run({
        autoCommit: false,
        eachMessage: async ({ message }) => {
          const value = message.value?.toString();
          if (!value) return;
          
          try {
            const dlqMessage = JSON.parse(value) as DeadLetterQueueMessage;
            
            if (dlqMessage.id === id) {
              foundMessage = dlqMessage;
              // 메시지를 찾았으면 더 이상 진행하지 않음
              await this.consumer.stop();
            }
          } catch (error) {
            logger.error("DLQ 메시지 파싱 실패", error);
          }
        },
      });
    } finally {
      await this.consumer.stop();
    }
    
    return foundMessage;
  }
} 