#!/usr/bin/env node

/**
 * Dead Letter Queue 관리 CLI
 * 
 * DLQ에 쌓인 메시지를 분석하고 관리하기 위한 명령줄 인터페이스입니다.
 * 
 * 사용법:
 *   npm run dlq -- analyze                 # DLQ 메시지 분석
 *   npm run dlq -- reprocess               # 모든 메시지 재처리
 *   npm run dlq -- reprocess --source naver  # 특정 소스 메시지만 재처리
 *   npm run dlq -- ignore --error-type PARSING  # 특정 오류 유형 메시지 무시 처리
 *   npm run dlq -- get <message-id>        # 특정 메시지 조회
 */

import { program } from 'commander';
import { DeadLetterQueueManager } from '@/utils/dlq-manager';
import { logger } from '@/utils/logger';
import { ErrorType, type DeadLetterQueueMessage } from '@/types';
import { env } from '@/config/env';
import { Kafka, type Consumer, type Producer, type Admin } from 'kafkajs';

// 환경 변수 로드
require('dotenv').config();

async function main() {
  const manager = new DeadLetterQueueManager();

  try {
    await manager.initialize();

    program
      .name('dlq-cli')
      .description('Dead Letter Queue 관리 도구')
      .version('1.0.0');

    program
      .command('analyze')
      .description('DLQ 메시지 분석 및 통계 출력')
      .action(async () => {
        try {
          logger.info('DLQ 메시지 분석 중...');
          const stats = await manager.analyzeDLQ();
          
          console.log('\n===== DLQ 메시지 통계 =====');
          console.log(`총 메시지 수: ${stats.totalMessages}`);
          
          console.log('\n--- 오류 유형별 통계 ---');
          for (const [errorType, count] of Object.entries(stats.byErrorType)) {
            console.log(`${errorType}: ${count}개`);
          }
          
          console.log('\n--- 소스별 통계 ---');
          for (const [source, count] of Object.entries(stats.bySource)) {
            console.log(`${source}: ${count}개`);
          }
          
          console.log('\n--- 상태별 통계 ---');
          for (const [status, count] of Object.entries(stats.byStatus)) {
            console.log(`${status}: ${count}개`);
          }
          
          console.log('\n분석 완료!');
        } catch (error) {
          logger.error('분석 중 오류 발생', error);
          process.exit(1);
        }
      });

    program
      .command('reprocess')
      .description('DLQ 메시지 재처리')
      .option('-s, --source <source>', '특정 소스 메시지만 재처리')
      .option('-e, --error-type <type>', '특정 오류 유형만 재처리')
      .option('-d, --dry-run', '실제 재처리하지 않고 대상만 출력')
      .action(async (options) => {
        try {
          const filter = (message: DeadLetterQueueMessage) => {
            if (options.source && message.source !== options.source) {
              return false;
            }
            if (options.errorType && message.errorType !== options.errorType) {
              return false;
            }
            return true;
          };

            const tempManager = new DeadLetterQueueManager();
            await tempManager.initialize();
          const reprocessedCount = await tempManager.reprocessMessages(filter);
            await tempManager.close();
            
          logger.info(`Total ${reprocessedCount} messages reprocessed based on the criteria.`);
        } catch (error) {
          logger.error('Error reprocessing DLQ messages:', error);
          process.exit(1);
        }
      });

    program
      .command('ignore')
      .description('DLQ 메시지 무시 처리')
      .option('-s, --source <source>', '특정 소스 메시지만 무시')
      .option('-e, --error-type <type>', '특정 오류 유형만 무시')
      .option('-d, --dry-run', '실제 무시 처리하지 않고 대상만 출력')
      .action(async (options) => {
        try {
          const filter = (message: DeadLetterQueueMessage) => {
            if (options.source && message.source !== options.source) {
              return false;
            }
            if (options.errorType && message.errorType !== options.errorType) {
              return false;
            }
            return true;
          };

            const tempManager = new DeadLetterQueueManager();
            await tempManager.initialize();
          const ignoredCount = await tempManager.ignoreMessages(filter);
            await tempManager.close();
            
          logger.info(`Total ${ignoredCount} messages marked as ignored based on the criteria.`);
        } catch (error) {
          logger.error('Error ignoring DLQ messages:', error);
          process.exit(1);
        }
      });

    program
      .command('get <id>')
      .description('특정 ID의 메시지 조회')
      .action(async (id) => {
        try {
          logger.info(`메시지 ID ${id} 조회 중...`);
          const message = await manager.getMessageById(id);
          
          if (!message) {
            logger.info(`메시지 ID ${id}를 찾을 수 없습니다.`);
            return;
          }
          
          console.log('\n===== 메시지 정보 =====');
          console.log(`ID: ${message.id}`);
          console.log(`키워드: ${message.originalRequest.keyword}`);
          console.log(`소스: ${message.source}`);
          console.log(`오류 유형: ${message.errorType}`);
          console.log(`상태: ${message.status}`);
          console.log(`재시도: ${message.retryCount}/${message.maxRetries}`);
          console.log(`시간: ${message.timestamp}`);
          
          console.log('\n--- 오류 메시지 ---');
          console.log(message.errorMessage);
          
          if (message.stackTrace) {
            console.log('\n--- 스택 트레이스 ---');
            console.log(message.stackTrace);
          }
          
          console.log('\n--- 원본 요청 ---');
          console.log(JSON.stringify(message.originalRequest, null, 2));
        } catch (error) {
          logger.error('메시지 조회 중 오류 발생', error);
          process.exit(1);
        }
      });

    await program.parseAsync(process.argv);
  } catch (error) {
    logger.error('DLQ CLI 실행 중 오류 발생', error);
    process.exit(1);
  } finally {
    await manager.close();
  }
}

main().catch((error) => {
  logger.error('예기치 않은 오류 발생', error);
  process.exit(1);
}); 