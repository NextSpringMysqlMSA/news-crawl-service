import crypto from "node:crypto";
import { env } from "@/config/env";
import { ErrorType, CrawlerError, type DeadLetterQueueMessage } from "@/types";
import type { CrawlRequest, SearchResult } from "@/types";
/**
 * Kafka 소비자 서비스
 * 키워드 토픽을 구독하고 크롤링 요청을 처리합니다.
 * 중복 메시지 처리, 백프레셔 관리, 오류 처리 전략이 구현되어 있습니다.
 */
import { logger } from "@/utils/logger";
import { Kafka } from "kafkajs";
import type { Consumer, EachMessagePayload, KafkaMessage } from "kafkajs";
import type { KafkaProducerService } from "./kafka-producer";
import type { CrawlerService } from "@/core/crawler-service";

// 오류 유형별 재시도 여부 정의
interface ErrorPolicy {
	shouldRetry: boolean;
	maxRetries: number;
	backoff: number; // ms
}

// 재시도 정책 맵
const ERROR_POLICY_MAP: Record<ErrorType, ErrorPolicy> = {
	[ErrorType.NETWORK]: { shouldRetry: true, maxRetries: 5, backoff: 10000 }, // 10초
	[ErrorType.TIMEOUT]: { shouldRetry: true, maxRetries: 3, backoff: 5000 }, // 5초
	[ErrorType.SELECTOR]: { shouldRetry: true, maxRetries: 2, backoff: 3000 }, // 3초
	[ErrorType.PARSING]: { shouldRetry: false, maxRetries: 0, backoff: 0 },
	[ErrorType.BROWSER]: { shouldRetry: true, maxRetries: 2, backoff: 5000 },
	[ErrorType.UNKNOWN]: { shouldRetry: false, maxRetries: 0, backoff: 0 },
};

/**
 * Kafka 소비자 서비스 클래스
 */
export class KafkaConsumerService {
	private kafka: Kafka;
	private consumer: Consumer;
	private crawlerService: CrawlerService;
	private producerService: KafkaProducerService;
	private isRunning = false;
	private deadLetterTopic: string;

	// 백프레셔 관련 필드
	private isProcessingPaused = false;
	private pendingMessages = 0;
	private readonly MAX_PENDING_MESSAGES = 20;

	// 메시지 중복 처리 관련 필드
	private processedMessageIds = new Set<string>();
	private readonly MESSAGE_CACHE_TTL = 30 * 60 * 1000; // 30분

	// 메시지 재시도 트래킹
	private messageRetries = new Map<string, number>();

	/**
	 * 생성자
	 * @param crawlerService - 크롤러 서비스 인스턴스
	 * @param producerService - Kafka 프로듀서 서비스 인스턴스
	 */
	constructor(
		crawlerService: CrawlerService,
		producerService: KafkaProducerService
	) {
		this.crawlerService = crawlerService;
		this.producerService = producerService;
		this.deadLetterTopic = `${env.kafka.topic}.dead-letter`;

		this.kafka = new Kafka({
			clientId: env.kafka.clientId,
			brokers: env.kafka.brokers,
		});

		this.consumer = this.kafka.consumer({
			groupId: env.kafka.groupId,
			// 자동 커밋 비활성화 (수동 커밋 사용)
			allowAutoTopicCreation: true,
			retry: {
				initialRetryTime: 1000,
				retries: 8,
			},
		});

		logger.debug("Kafka 소비자 서비스 인스턴스 생성됨");

		// 정기적으로 만료된 메시지 ID 정리
		setInterval(() => this.cleanupExpiredMessageIds(), 10 * 60 * 1000); // 10분마다
	}

	/**
	 * 메시지 ID 생성
	 * @param request - 크롤링 요청
	 * @returns 메시지 고유 ID
	 */
	private generateMessageId(request: CrawlRequest): string {
		const data = `${request.keyword}_${request.periods.join("_")}_${JSON.stringify(request.sources || [])}`;
		return crypto.createHash("md5").update(data).digest("hex");
	}

	/**
	 * 처리된 메시지 ID 캐시에 추가
	 * @param messageId - 메시지 ID
	 */
	private cacheProcessedMessageId(messageId: string): void {
		this.processedMessageIds.add(messageId);

		// 일정 시간 후 캐시에서 제거
		setTimeout(() => {
			this.processedMessageIds.delete(messageId);
		}, this.MESSAGE_CACHE_TTL);
	}

	/**
	 * 만료된 메시지 ID 정리
	 */
	private cleanupExpiredMessageIds(): void {
		const _initialSize = this.processedMessageIds.size;
		// 현재는 setTimeout으로 자동 정리되지만,
		// 추가 정리 로직이 필요한 경우 여기에 구현
		logger.debug(
			`메시지 ID 캐시 상태: ${this.processedMessageIds.size}개 항목`
		);
	}

	/**
	 * 오류 유형 감지
	 * @param error - 발생한 오류
	 * @returns 오류 유형
	 */
	private detectErrorType(error: Error | unknown): ErrorType {
		if (error instanceof CrawlerError && error.errorType) {
			return error.errorType;
		}

		if (error instanceof Error) {
			const errorMessage = error.message.toLowerCase();

			if (
				errorMessage.includes("net::") ||
				errorMessage.includes("network") ||
				errorMessage.includes("connection") ||
				errorMessage.includes("econnrefused")
			) {
				return ErrorType.NETWORK;
			}

			if (
				errorMessage.includes("timeout") ||
				errorMessage.includes("timed out")
			) {
				return ErrorType.TIMEOUT;
			}

			if (
				errorMessage.includes("selector") ||
				errorMessage.includes("element not found")
			) {
				return ErrorType.SELECTOR;
			}

			if (errorMessage.includes("parse") || errorMessage.includes("parsing")) {
				return ErrorType.PARSING;
			}

			// Puppeteer 관련 오류 메시지 추가
			if (
				errorMessage.includes("navigation failed") ||
				errorMessage.includes("protocol error") ||
				errorMessage.includes("target closed")
			) {
				return ErrorType.BROWSER;
			}
		}
		return ErrorType.UNKNOWN; // 기본값
	}

	/**
	 * 데드 레터 큐로 메시지 전송
	 * @param originalRequest - 원본 크롤링 요청
	 * @param error - 발생한 오류
	 * @param source - 오류가 발생한 소스 (선택적)
	 * @param retryCount - 재시도 횟수 (선택적)
	 * @param errorType - 오류 유형 (선택적)
	 */
	private async sendToDeadLetterQueue(
		params: {
			originalRequest: CrawlRequest;
			error: unknown;
			source?: string;
			retryCount?: number;
			errorType?: ErrorType;
		}
	): Promise<void> {
		try {
			const { originalRequest, error, source, retryCount, errorType } = params;
			const messageId = this.generateMessageId(originalRequest);
			const detectedErrorType = errorType || this.detectErrorType(error);
			const policy = ERROR_POLICY_MAP[detectedErrorType];
			
			// 오류 메시지와 스택 트레이스 추출
			let errorMessage: string;
			let stackTrace: string | undefined;
			
			if (error instanceof Error) {
				errorMessage = error.message;
				stackTrace = error.stack;
			} else if (typeof error === 'object' && error !== null && 'error' in error && typeof error.error === 'string') {
				// SearchResult 타입의 에러 객체인 경우
				errorMessage = error.error;
			} else {
				errorMessage = String(error);
			}

			// Dead Letter Queue 메시지 생성
			const deadLetterMessage: DeadLetterQueueMessage = {
				id: messageId,
				timestamp: new Date().toISOString(),
				originalRequest,
				errorType: detectedErrorType,
				errorMessage,
				stackTrace,
				retryCount: retryCount || 0,
				maxRetries: policy.maxRetries,
				source: source || 'unknown',
				status: 'failed'
			};

			logger.warn(
				`데드 레터 메시지 생성: 키워드 "${originalRequest.keyword}", 오류 유형: ${detectedErrorType}, 소스: ${deadLetterMessage.source}, 재시도: ${deadLetterMessage.retryCount}/${deadLetterMessage.maxRetries}`
			);

			// 전용 DLQ 토픽으로 메시지 발행
			const success = await this.producerService.publishDeadLetterMessage(deadLetterMessage);

			if (success) {
				logger.info(`메시지 ID ${messageId}가 데드 레터 큐(${this.deadLetterTopic})로 전송됨`);
			} else {
				logger.error(`데드 레터 큐(${this.deadLetterTopic})로 메시지 전송 실패`);
			}
		} catch (error) {
			logger.error("데드 레터 큐로 메시지 전송 중 예외 발생", error);
		}
	}

	/**
	 * 메시지 처리 메서드
	 * @param payload - Kafka 메시지 페이로드
	 */
	private async processMessage(payload: EachMessagePayload): Promise<void> {
		const { topic, partition, message } = payload;
		const value = message.value?.toString();

		if (!value) {
			logger.warn(`비어있는 메시지 수신됨: ${topic}-${partition}`);
			// 빈 메시지는 커밋하고 처리 종료
			await this.commitOffset(topic, partition, message);
			return;
		}

		// 백프레셔 카운터 증가
		this.pendingMessages++;

		try {
			logger.info(
				`메시지 수신: ${topic}-${partition}, 오프셋: ${message.offset}`
			);

			// JSON 메시지를 CrawlRequest로 파싱
			const request = JSON.parse(value) as CrawlRequest;

			// 메시지 중복 처리 체크
			const messageId = this.generateMessageId(request);
			if (this.processedMessageIds.has(messageId)) {
				logger.info(
					`중복 메시지 감지됨, 처리 건너뜀: ${messageId} (키워드: ${request.keyword})`
				);
				// 중복 메시지는 처리하지 않고 커밋만 수행
				await this.commitOffset(topic, partition, message);
				return;
			}

			logger.info(
				`크롤링 요청 처리 중: 키워드 "${request.keyword}", 기간 ${request.periods.join(", ")}`
			);

			// 크롤링 요청 처리
			try {
				const allResults: SearchResult[] =
					await this.crawlerService.processCrawlRequest(request);

				const results: SearchResult[] = [];
				const errors: SearchResult[] = [];

				for (const res of allResults) {
					if (res.error) {
						errors.push(res);
					} else {
						results.push(res);
					}
				}

				// 결과 전송
				if (results.length > 0) {
					await this.producerService.sendResults(results);
					logger.info(`${results.length}개 소스의 검색 결과 전송 완료`);
				}

				// 오류 정보 로깅
				if (errors.length > 0) {
					const errorSources = errors.map((e) => e.source).join(", ");
					logger.warn(`${errors.length}개 소스에서 오류 발생: ${errorSources}`);

					// 영구적 오류가 발생한 경우 데드레터 큐로 전송
					for (const errorResult of errors) {
						const errorObject = new Error(errorResult.error || "Unknown error");
						const errorType = this.detectErrorType(errorObject);
						const policy = ERROR_POLICY_MAP[errorType];

						if (!policy.shouldRetry) {
							// 재시도할 수 없는 영구적 오류는 데드레터 큐로 전송
							await this.sendToDeadLetterQueue({
								originalRequest: request,
								error: errorResult,
								source: errorResult.source,
								errorType
							});
						}
					}
				}

				// 메시지 처리 완료 후 메시지 ID 캐시에 추가
				this.cacheProcessedMessageId(messageId);

				// 성공적으로 처리된 메시지 커밋
				await this.commitOffset(topic, partition, message);
			} catch (error) {
				const errorType = this.detectErrorType(error);
				const policy = ERROR_POLICY_MAP[errorType];
				const retryCount = this.messageRetries.get(messageId) || 0;

				if (policy.shouldRetry && retryCount < policy.maxRetries) {
					// 재시도 가능한 오류는 재시도 카운터 증가 후 커밋하지 않음 (다시 처리)
					this.messageRetries.set(messageId, retryCount + 1);
					const backoff = policy.backoff * (retryCount + 1); // 지수 백오프

					logger.warn(
						`메시지 처리 실패 (${errorType}), ${backoff}ms 후 재시도 (${retryCount + 1}/${policy.maxRetries}): ${messageId}`
					);

					// 메시지를 커밋하지 않고 종료
					return;
				}

				// 재시도 불가능하거나 최대 재시도 횟수 초과 시 데드레터 큐로 전송
				logger.error(`메시지 처리 실패, 데드레터 큐로 전송: ${messageId}`);

				await this.sendToDeadLetterQueue({
					originalRequest: request,
					error,
					retryCount,
					errorType,
				});

				// 메시지 커밋 (더 이상 처리하지 않음)
				await this.commitOffset(topic, partition, message);

				// 재시도 카운터에서 제거
				this.messageRetries.delete(messageId);
			}
		} catch (error) {
			// 메시지 파싱 오류 등 기본 처리 오류
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error(`메시지 처리 중 오류 발생: ${errorMessage}`, error);

			// 기본 오류도 커밋 (처리되지 않은 메시지가 계속 재시도되지 않도록)
			try {
				await this.commitOffset(topic, partition, message);
			} catch (commitError) {
				logger.error("메시지 커밋 실패", commitError);
			}
		} finally {
			// 백프레셔 카운터 감소
			this.pendingMessages--;

			// 백프레셔 관리: 처리량이 줄어들면 소비 재개
			if (
				this.isProcessingPaused &&
				this.pendingMessages < this.MAX_PENDING_MESSAGES / 2
			) {
				this.isProcessingPaused = false;
				logger.info("메시지 처리 재개");
				this.consumer.resume([{ topic }]);
			}
		}
	}

	/**
	 * 안전한 오프셋 커밋
	 * @param topic - 토픽 이름
	 * @param partition - 파티션 번호
	 * @param message - Kafka 메시지
	 */
	private async commitOffset(
		topic: string,
		partition: number,
		message: KafkaMessage
	): Promise<void> {
		try {
			await this.consumer.commitOffsets([
				{
					topic,
					partition,
					offset: (Number(message.offset) + 1).toString(),
				},
			]);
		} catch (error) {
			logger.error("오프셋 커밋 실패", error);
			throw error;
		}
	}

	/**
	 * 소비자 서비스 시작
	 */
	public async start(): Promise<void> {
		if (this.isRunning) {
			logger.warn("Kafka 소비자 서비스가 이미 실행 중입니다.");
			return;
		}

		logger.info("Kafka 소비자 서비스 시작 중...");

		try {
			// 소비자 연결
			await this.consumer.connect();

			// 토픽 구독
			await this.consumer.subscribe({
				topic: env.kafka.topic,
				fromBeginning: false,
			});

			// 백프레셔 관리를 위한 정기 확인 간격 설정
			const _backpressureInterval = setInterval(() => {
				if (
					this.pendingMessages > this.MAX_PENDING_MESSAGES &&
					!this.isProcessingPaused
				) {
					this.isProcessingPaused = true;
					logger.warn(
						`메시지 처리 일시 중지, 대기 중 메시지: ${this.pendingMessages}`
					);
					this.consumer.pause([{ topic: env.kafka.topic }]);
				}
			}, 1000); // 1초마다 확인

			// 메시지 수신 시작 (자동 커밋 비활성화)
			await this.consumer.run({
				autoCommit: false,
				eachMessage: async (payload) => {
					await this.processMessage(payload);
				},
			});

			this.isRunning = true;
			logger.info(`Kafka 소비자 서비스 시작됨 (토픽: ${env.kafka.topic})`);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error(`Kafka 소비자 서비스 시작 실패: ${errorMessage}`, error);
			throw error;
		}
	}

	/**
	 * 소비자 서비스 중지
	 */
	public async stop(): Promise<void> {
		if (!this.isRunning) {
			logger.warn("Kafka 소비자 서비스가 실행 중이 아닙니다.");
			return;
		}

		logger.info("Kafka 소비자 서비스 중지 중...");

		try {
			await this.consumer.disconnect();
			this.isRunning = false;
			logger.info("Kafka 소비자 서비스 중지됨");
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error(`Kafka 소비자 서비스 중지 실패: ${errorMessage}`, error);
			throw error;
		}
	}

	/**
	 * 서비스 실행 중 여부 확인
	 * @returns 실행 중 여부
	 */
	public isActive(): boolean {
		return this.isRunning;
	}

	/**
	 * 서비스 상태 정보 반환
	 * @returns 서비스 상태 정보
	 */
	public getStatus(): {
		isRunning: boolean;
		pendingMessages: number;
		isPaused: boolean;
		cachedMessageIds: number;
	} {
		return {
			isRunning: this.isRunning,
			pendingMessages: this.pendingMessages,
			isPaused: this.isProcessingPaused,
			cachedMessageIds: this.processedMessageIds.size,
		};
	}
}
