import { env } from "@/config/env";
import type { SearchResult, DeadLetterQueueMessage } from "@/types";
import { logger } from "@/utils/logger";
/**
 * Kafka 프로듀서 서비스
 * 검색 결과를 Kafka 토픽에 발행합니다.
 */
import { Kafka } from "kafkajs";
import type { Producer } from "kafkajs";

/**
 * Kafka 프로듀서 서비스 클래스
 * 뉴스 검색 결과를 Kafka 토픽에 발행합니다.
 */
export class KafkaProducerService {
	private producer: Producer;
	private topic: string;
	private isConnected = false;
	private kafkaAvailable = true;
	private deadLetterTopic: string;

	/**
	 * 생성자
	 * @param topic - 메시지를 발행할 Kafka 토픽
	 * @param deadLetterTopic - 데드 레터 메시지를 발행할 Kafka 토픽 (선택적)
	 */
	constructor(topic: string, deadLetterTopic?: string) {
		logger.debug(`Kafka 프로듀서 서비스 인스턴스 생성 (토픽: ${topic})`);

		const kafka = new Kafka({
			clientId: env.kafka.clientId,
			brokers: env.kafka.brokers,
		});

		this.producer = kafka.producer();
		this.topic = topic;
		this.deadLetterTopic = deadLetterTopic || `${topic}.dead-letter`;
	}

	/**
	 * Kafka 프로듀서 연결
	 */
	async connect(): Promise<boolean> {
		if (this.isConnected) {
			return true;
		}

		logger.info("Kafka 프로듀서 연결 중...");

		try {
			await this.producer.connect();
			this.isConnected = true;
			this.kafkaAvailable = true;
			logger.info(`Kafka 프로듀서 연결 성공 (토픽: ${this.topic})`);
			return true;
		} catch (error) {
			this.kafkaAvailable = false;
			logger.warn(
				"Kafka 프로듀서 연결 실패, 메시지는 로컬에만 기록됩니다",
				error
			);
			return false;
		}
	}

	/**
	 * Kafka 프로듀서 연결 해제
	 */
	async disconnect(): Promise<void> {
		if (!this.isConnected) {
			return;
		}

		logger.info("Kafka 프로듀서 연결 해제 중...");

		try {
			await this.producer.disconnect();
			this.isConnected = false;
			logger.info("Kafka 프로듀서 연결 해제 완료");
		} catch (error) {
			logger.warn("Kafka 프로듀서 연결 해제 실패", error);
		}
	}

	/**
	 * 검색 결과 로컬 로깅
	 * @param result - 로그에 기록할 검색 결과
	 */
	private logResultLocally(result: SearchResult): void {
		logger.info(
			`[로컬 로그] 검색 결과: 키워드 "${result.keyword}", 소스 ${result.source}, ${result.newsItems.length}개 항목`
		);
	}

	/**
	 * 배치 검색 결과 로컬 로깅
	 * @param results - 로그에 기록할 검색 결과 배열
	 */
	private logResultsLocally(results: SearchResult[]): void {
		logger.info(`[로컬 로그] 배치 검색 결과: ${results.length}개 항목`);
		if (results.length > 0) {
			for (const result of results) {
				logger.debug(
					`[로컬 로그] - 키워드: "${result.keyword}", 소스: ${result.source}, 항목 수: ${result.newsItems.length}`
				);
			}
		}
	}

	/**
	 * Dead Letter Queue 메시지 로컬 로깅
	 * @param message - 로그에 기록할 DLQ 메시지
	 */
	private logDeadLetterLocally(message: DeadLetterQueueMessage): void {
		logger.warn(
			`[로컬 로그] DLQ 메시지: ID ${message.id}, 키워드 "${message.originalRequest.keyword}", 오류 유형 ${message.errorType}, 재시도 ${message.retryCount}/${message.maxRetries}`
		);
		logger.debug(`[로컬 로그] DLQ 오류 메시지: ${message.errorMessage}`);
		if (message.stackTrace) {
			logger.debug(`[로컬 로그] DLQ 스택 트레이스: ${message.stackTrace}`);
		}
	}

	/**
	 * 지정된 토픽으로 Kafka 메시지 발행 시도
	 * @param topic - 메시지를 발행할 토픽
	 * @param messages - 발행할 메시지 배열
	 * @returns 발행 성공 여부
	 */
	private async tryPublishToTopic(
		topic: string,
		messages: Array<{ key: string; value: string }>
	): Promise<boolean> {
		if (!this.kafkaAvailable) {
			return false;
		}

		if (!this.isConnected) {
			const connected = await this.connect();
			if (!connected) {
				return false;
			}
		}

		try {
			await this.producer.send({
				topic,
				messages,
			});
			return true;
		} catch (error) {
			this.kafkaAvailable = false;
			logger.warn(`Kafka 연결 문제로 토픽 ${topic}에 메시지 발행 실패`, error);
			return false;
		}
	}

	/**
	 * Kafka 메시지 발행 시도 (기본 토픽)
	 * @param messages - 발행할 메시지 배열
	 * @returns 발행 성공 여부
	 */
	private async tryPublish(
		messages: Array<{ key: string; value: string }>
	): Promise<boolean> {
		return this.tryPublishToTopic(this.topic, messages);
	}

	/**
	 * 검색 결과를 Kafka 토픽에 발행
	 * @param result - 발행할 검색 결과
	 */
	async publishResult(result: SearchResult): Promise<void> {
		logger.debug(
			`검색 결과 발행 시도: 키워드 "${result.keyword}", 소스 ${result.source}, ${result.newsItems.length}개 항목`
		);

		const message = {
			key: `${result.keyword}-${result.source}`,
			value: JSON.stringify(result),
		};

		const success = await this.tryPublish([message]);

		if (success) {
			logger.debug(
				`검색 결과 발행 완료: 키워드 "${result.keyword}", 소스 ${result.source}`
			);
		} else {
			this.logResultLocally(result);
		}
	}

	/**
	 * 여러 검색 결과를 한 번에 Kafka 토픽에 발행
	 * @param results - 발행할 검색 결과 배열
	 */
	async publishResults(results: SearchResult[]): Promise<void> {
		if (results.length === 0) {
			return;
		}

		logger.debug(`배치 검색 결과 발행 시도: ${results.length}개 항목`);

		const messages = results.map((result) => ({
			key: `${result.keyword}-${result.source}`,
			value: JSON.stringify(result),
		}));

		const success = await this.tryPublish(messages);

		if (success) {
			logger.debug("배치 검색 결과 발행 완료");
		} else {
			this.logResultsLocally(results);
		}
	}

	/**
	 * Dead Letter Queue 메시지를 전용 토픽에 발행
	 * @param message - 발행할 DLQ 메시지
	 * @returns 발행 성공 여부
	 */
	async publishDeadLetterMessage(message: DeadLetterQueueMessage): Promise<boolean> {
		logger.debug(
			`DLQ 메시지 발행 시도: ID ${message.id}, 키워드 "${message.originalRequest.keyword}", 오류 유형 ${message.errorType}`
		);

		const kafkaMessage = {
			key: message.id,
			value: JSON.stringify(message),
		};

		const success = await this.tryPublishToTopic(this.deadLetterTopic, [kafkaMessage]);

		if (success) {
			logger.info(
				`DLQ 메시지 발행 완료 (토픽: ${this.deadLetterTopic}): ID ${message.id}, 키워드 "${message.originalRequest.keyword}"`
			);
		} else {
			this.logDeadLetterLocally(message);
			logger.warn(`DLQ 메시지 발행 실패, 로컬에만 기록됨: ID ${message.id}`);
		}

		return success;
	}

	/**
	 * 여러 검색 결과를 한 번에 Kafka 토픽에 발행
	 * @param results - 발행할 검색 결과 배열
	 */
	async sendResults(results: SearchResult[]): Promise<void> {
		if (results.length === 0) {
			logger.warn("발행할 결과가 없습니다.");
			return;
		}

		if (!this.isConnected) {
			await this.connect();
		}

		logger.info(`총 ${results.length}개의 검색 결과 발행 시작`);

		const publishPromises = results.map((result) => this.publishResult(result));

		try {
			await Promise.all(publishPromises);
			logger.info(`총 ${results.length}개의 검색 결과 발행 완료`);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error(`검색 결과 발행 중 오류 발생: ${errorMessage}`, error);
			throw error;
		}
	}

	/**
	 * 연결 상태 확인
	 * @returns 연결 상태
	 */
	public isActive(): boolean {
		return this.isConnected;
	}
}
