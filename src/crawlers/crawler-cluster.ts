import { env } from "@/config/env";
import {
	recordCrawlingFailure,
	recordCrawlingStart,
	recordCrawlingSuccess,
	recordMemoryUsage,
} from "@/monitoring/metrics";
import type { CrawlOptions, SearchResult, NewsItem } from "@/types";
import { logger } from "@/utils/logger";
import type { Page } from "puppeteer";
/**
 * 크롤러 클러스터 관리자
 * Puppeteer 브라우저 인스턴스를 효율적으로 관리하는 클러스터 제공
 */
import { Cluster } from "puppeteer-cluster";
import { ErrorType, CrawlerError } from "@/types";
import type { RetryOptions } from "@/core/base-crawler";
import type { CrawlerRegistry } from "@/core/crawler-registry";
import type { NewsCrawler } from '@/core/crawler.interface';
import type { Logger } from 'winston';

/**
 * 크롤링 작업 데이터 인터페이스
 */
interface CrawlTask {
	source: string;
	keyword: string;
	period?: string;
	options?: CrawlOptions;
}

// 기본 재시도 설정
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
	maxRetries: 3,
	initialDelay: 1000, // 1초
	maxDelay: 30000, // 30초
	factor: 2, // 지수 백오프
};

/**
 * 크롤러 클러스터 클래스
 * Puppeteer 인스턴스를 효율적으로 관리하는 클러스터 구현
 */
export class CrawlerCluster {
	private cluster: Cluster<CrawlTask, SearchResult> | null = null;
	private registry: CrawlerRegistry;
	private initialized = false;
	private concurrentLimit: number;
	private retryOptions: RetryOptions;
	private memoryCheckInterval: NodeJS.Timeout | null = null;

	/**
	 * 생성자
	 * @param registry - 크롤러 레지스트리 인스턴스
	 * @param customRetryOptions - 커스텀 재시도 설정 (선택사항)
	 */
	constructor(
		registry: CrawlerRegistry,
		customRetryOptions?: Partial<RetryOptions>
	) {
		this.registry = registry;
		this.concurrentLimit = env.crawler.concurrentLimit;
		this.retryOptions = {
			...DEFAULT_RETRY_OPTIONS,
			...customRetryOptions,
		};
		logger.debug(
			`크롤러 클러스터 인스턴스 생성됨 (동시성 제한: ${this.concurrentLimit}, 최대 재시도: ${this.retryOptions.maxRetries})`
		);
	}

	/**
	 * 클러스터 초기화
	 * @param maxConcurrency - 최대 동시 실행 수
	 */
	public async initialize(maxConcurrency?: number): Promise<void> {
		if (this.initialized) {
			return;
		}

		const concurrency = maxConcurrency || this.concurrentLimit;
		logger.info(`크롤러 클러스터 초기화 중 (최대 동시 실행: ${concurrency})`);

		try {
			this.cluster = await Cluster.launch({
				concurrency: Cluster.CONCURRENCY_BROWSER, // 브라우저 단위로 동시성 관리
				maxConcurrency: concurrency,
				timeout: env.crawler.timeout,
				puppeteerOptions: {
					headless: env.crawler.headless ? "new" : false,
					args: [
						"--no-sandbox",
						"--disable-setuid-sandbox",
						"--disable-dev-shm-usage",
						"--disable-accelerated-2d-canvas",
						"--disable-gpu",
						"--js-flags=--expose-gc", // V8 가비지 컬렉션 노출
					],
					defaultViewport: { width: 1366, height: 768 },
				},
				monitor: true, // 클러스터 모니터링 활성화
				retryLimit: this.retryOptions.maxRetries,
				retryDelay: this.retryOptions.initialDelay, // 고정 지연 값 사용
			});

			// 클러스터 태스크 정의
			this.cluster.task(async ({ page, data }) => {
				return this.executeTask(page, data);
			});

			this.cluster.on("taskerror", (err, data) => {
				const errorMessage = err instanceof Error ? err.message : String(err);
				const errorType = this.detectErrorType(
					err instanceof Error ? err : new Error(errorMessage)
				);
				logger.error(
					`클러스터 작업 오류 발생: ${data.source}, 키워드: ${data.keyword}, 오류 유형: ${errorType}`,
					err
				);
			});

			// 메모리 모니터링 시작
			this.startMemoryMonitoring();

			this.initialized = true;
			logger.info("크롤러 클러스터 초기화 완료");
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error(`크롤러 클러스터 초기화 실패: ${errorMessage}`, error);
			throw error;
		}
	}

	/**
	 * 메모리 모니터링 시작
	 */
	private startMemoryMonitoring(): void {
		// 기존 인터벌이 있으면 중지
		this.stopMemoryMonitoring();

		// 30초마다 메모리 사용량 확인
		this.memoryCheckInterval = setInterval(() => {
			try {
				const memoryUsage = process.memoryUsage();
				const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
				const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);

				// 메트릭 기록
				recordMemoryUsage("cluster", heapUsedMB, heapTotalMB);

				// 메모리 사용량이 높은 경우 로그 및 조치
				if (heapUsedMB > 1000) {
					// 1GB 이상일 때
					logger.warn(
						`높은 메모리 사용량 감지: 클러스터, 힙 사용: ${heapUsedMB}MB/${heapTotalMB}MB`
					);

					// 가비지 컬렉션 강제 실행 시도
					if (global.gc) {
						global.gc();
						logger.info("가비지 컬렉션 강제 실행됨: 클러스터");
					}

					// 메모리 사용량이 매우 높은 경우 클러스터 재시작 고려
					if (heapUsedMB > 1500) {
						logger.error("메모리 사용량이 너무 높습니다. 클러스터 재시작 필요");
						// 필요시 클러스터 재시작 로직 추가
					}
				}
			} catch (error) {
				logger.error("메모리 모니터링 중 오류: 클러스터", error);
			}
		}, 30000); // 30초마다
	}

	/**
	 * 메모리 모니터링 중지
	 */
	private stopMemoryMonitoring(): void {
		if (this.memoryCheckInterval) {
			clearInterval(this.memoryCheckInterval);
			this.memoryCheckInterval = null;
		}
	}

	/**
	 * 동적 재시도 지연 시간 계산 (puppeteer-cluster에서 사용)
	 * @param retryCount - 현재 재시도 횟수
	 * @param error - 발생한 오류
	 * @returns 지연 시간(ms)
	 */
	private calculateDynamicRetryDelay(retryCount: number, error: Error): number {
		const errorType = this.detectErrorType(error);
		let factor = this.retryOptions.factor;

		// 오류 유형에 따라 지연 시간 조정
		switch (errorType) {
			case ErrorType.NETWORK:
				// 네트워크 오류는 더 오래 기다림
				factor *= 1.5;
				break;
			case ErrorType.TIMEOUT:
				// 타임아웃은 기본 지수 백오프 사용
				break;
			case ErrorType.SELECTOR:
				// 셀렉터 오류는 짧게 재시도
				factor *= 0.8;
				break;
			default:
				// 기본 지수 백오프 사용
				break;
		}

		// 지수 백오프 계산
		const delay = this.retryOptions.initialDelay * factor ** retryCount;
		return Math.min(delay, this.retryOptions.maxDelay);
	}

	/**
	 * 오류 유형 감지
	 * @param error - 발생한 오류
	 * @returns 오류 유형
	 */
	private detectErrorType(error: Error): ErrorType {
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

		if (
			errorMessage.includes("browser") ||
			errorMessage.includes("puppeteer")
		) {
			return ErrorType.BROWSER;
		}

		return ErrorType.UNKNOWN;
	}

	/**
	 * 클러스터 종료
	 */
	public async close(): Promise<void> {
		if (!(this.initialized && this.cluster)) {
			return;
		}

		logger.info("크롤러 클러스터 종료 중...");

		// 메모리 모니터링 중지
		this.stopMemoryMonitoring();

		try {
			// 진행 중인 작업 완료 대기
			await this.cluster.idle();
			// 클러스터 종료
			await this.cluster.close();

			this.initialized = false;
			logger.info("크롤러 클러스터 종료 완료");
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error(`크롤러 클러스터 종료 실패: ${errorMessage}`, error);
			throw error;
		}
	}

	/**
	 * 크롤링 작업 실행
	 * @param page - Puppeteer 페이지 인스턴스
	 * @param task - 크롤링 작업 데이터
	 * @returns 검색 결과
	 */
	private async executeTask(
		page: Page,
		task: CrawlTask
	): Promise<SearchResult> {
		const { source, keyword, period, options } = task;
		logger.info(
			`클러스터 작업 실행: ${source}, 키워드: "${keyword}", 기간: ${period || '전체'}`
		);
		const startTime = Date.now();

		try {
			const crawler = this.registry.getCrawler(source);
			if (!crawler) {
				throw new CrawlerError(
					`클러스터 작업: 크롤러를 찾을 수 없습니다: ${source}`,
					source,
					keyword,
					ErrorType.UNKNOWN
				);
			}

			const result = await crawler.searchNews(keyword, period, options);

			const durationSeconds = (Date.now() - startTime) / 1000;
			recordCrawlingSuccess(source, durationSeconds, result.newsItems.length);
			logger.info(
				`클러스터 작업 완료: ${source}, 키워드: "${keyword}", 기간: ${result.period || '전체'}, ${result.newsItems.length}개 항목 (${durationSeconds.toFixed(2)}초)`
			);
			return result;
		} catch (error) {
			const durationSeconds = (Date.now() - startTime) / 1000;
			recordCrawlingFailure(source, durationSeconds);

			const errorMessage =
				error instanceof Error ? error.message : String(error);
			const errorType = this.detectErrorType(
				error instanceof Error ? error : new Error(errorMessage)
			);

			logger.error(
				`클러스터 작업 실패: ${source}, 키워드: "${keyword}", 기간: ${period || '전체'}, 오류: ${errorMessage}`,
				error
			);

			// 오류를 다시 throw하여 puppeteer-cluster의 재시도 로직이 작동하도록 함
			throw new CrawlerError(errorMessage, source, keyword, errorType);
		}
	}

	/**
	 * 특정 소스에 대한 뉴스 검색 요청 (클러스터 사용)
	 * @param source - 크롤러 소스 이름
	 * @param keyword - 검색 키워드
	 * @param period - 검색 기간 (선택적)
	 * @param options - 검색 옵션
	 * @returns 검색 결과
	 */
	public async searchNews(
		source: string,
		keyword: string,
		period?: string,
		options?: CrawlOptions
	): Promise<SearchResult> {
		if (!this.initialized || !this.cluster) {
			await this.initialize();
		}

		if (!this.cluster) {
			const errorMsg = "크롤러 클러스터가 초기화되지 않았습니다.";
			logger.error(errorMsg);
			return {
				keyword,
				period,
				timestamp: new Date().toISOString(),
				newsItems: [],
				source,
				error: errorMsg,
			};
		}

		logger.info(
			`클러스터에 작업 추가: ${source}, 키워드: "${keyword}", 기간: ${period || '전체'}`
		);

		try {
			const result = await this.cluster.execute({
				source,
				keyword,
				period,
				options,
			});
			return result;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error(
				`클러스터 작업 실행 중 오류 발생: ${source}, 키워드: "${keyword}", 기간: ${period || '전체'}, 오류: ${errorMessage}`,
				error
			);

			// 오류 발생 시 빈 결과 반환 (period 포함)
			return {
				keyword,
				period,
				timestamp: new Date().toISOString(),
				newsItems: [],
				source,
				error: errorMessage,
			};
		}
	}

	/**
	 * 동시성 제한 값 설정
	 * @param limit - 최대 동시 실행 수
	 */
	public async setConcurrentLimit(limit: number): Promise<void> {
		this.concurrentLimit = limit;

		if (this.initialized && this.cluster) {
			logger.info(`클러스터 동시성 제한 변경 중: ${limit}`);

			try {
				// puppeteer-cluster는 동적으로 동시성을 변경할 수 있는 API를 제공하지 않음
				// 클러스터를 재시작해야 함
				await this.close();
				await this.initialize(limit);
				logger.info(`클러스터 동시성 제한이 ${limit}로 변경됨`);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				logger.error(`동시성 제한 변경 실패: ${errorMessage}`, error);
				throw error;
			}
		} else {
			logger.info(
				`동시성 제한이 ${limit}로 설정됨 (클러스터가 아직 초기화되지 않음)`
			);
		}
	}

	/**
	 * 초기화 여부 반환
	 * @returns 초기화 완료 여부
	 */
	public isInitialized(): boolean {
		return this.initialized;
	}

	/**
	 * 활성 작업 수 반환
	 * @returns 활성 작업 수
	 */
	public getActiveTaskCount(): number {
		if (!(this.initialized && this.cluster)) {
			return 0;
		}

		// puppeteer-cluster의 내부 API가 변경되었을 수 있으므로 안전하게 처리
		try {
			// @ts-ignore - workersBusy는 private이지만 직접 접근
			const busyWorkers = this.cluster.workersBusy?.length || 0;
			return busyWorkers;
		} catch (error) {
			logger.error("활성 작업 수 조회 실패", error);
			return 0;
		}
	}
}
