import { env } from "@/config/env";
import { recordMemoryUsage } from "@/monitoring/metrics";
import type { CrawlOptions, NewsItem, SearchResult } from "@/types";
/**
 * 기본 크롤러 추상 클래스
 * 모든 크롤러 구현체의 기본 기능과 재시도 메커니즘을 제공합니다.
 */
import { logger } from "@/utils/logger";
import puppeteer, { type Browser, type Page } from "puppeteer";
import type { NewsCrawler } from "./crawler.interface";

// 오류 유형 정의
export enum ErrorType {
	NETWORK = "network", // 네트워크 관련 오류
	TIMEOUT = "timeout", // 타임아웃 오류
	SELECTOR = "selector", // 셀렉터 찾기 실패
	PARSING = "parsing", // 파싱 관련 오류
	BROWSER = "browser", // 브라우저 관련 오류
	UNKNOWN = "unknown", // 기타 알 수 없는 오류
}

// 재시도 설정 인터페이스
export interface RetryOptions {
	maxRetries: number; // 최대 재시도 횟수
	initialDelay: number; // 초기 지연 시간 (ms)
	maxDelay: number; // 최대 지연 시간 (ms)
	factor: number; // 지수 백오프 계수
}

// 기본 재시도 설정
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
	maxRetries: 3,
	initialDelay: 1000, // 1초
	maxDelay: 30000, // 30초
	factor: 2, // 지수 백오프
};

/**
 * 기본 크롤러 추상 클래스
 * 모든 뉴스 크롤러 구현체의 공통 기능을 제공합니다.
 */
export abstract class BaseCrawler implements NewsCrawler {
	protected browser: Browser | null = null;
	protected readonly source: string;
	protected initialized = false;
	protected userAgent: string;
	protected timeout: number;
	protected retryOptions: RetryOptions;
	protected memoryCheckInterval: NodeJS.Timeout | null = null;

	/**
	 * 생성자
	 * @param source - 크롤러 소스 이름
	 * @param customRetryOptions - 커스텀 재시도 설정 (선택사항)
	 */
	constructor(source: string, customRetryOptions?: Partial<RetryOptions>) {
		this.source = source;
		this.userAgent = env.crawler.userAgent;
		this.timeout = env.crawler.timeout;
		this.retryOptions = {
			...DEFAULT_RETRY_OPTIONS,
			...customRetryOptions,
		};
		logger.debug(
			`크롤러 인스턴스 생성됨: ${source} (최대 재시도: ${this.retryOptions.maxRetries})`,
		);
	}

	/**
	 * 크롤러 초기화 메서드
	 * 브라우저 인스턴스를 생성하고 초기 설정을 수행합니다.
	 */
	public async initialize(): Promise<void> {
		if (this.initialized && this.browser) {
			return;
		}

		logger.info(`크롤러 초기화 중: ${this.source}`);

		try {
			this.browser = await puppeteer.launch({
				headless: env.crawler.headless,
				args: [
					"--no-sandbox",
					"--disable-setuid-sandbox",
					"--disable-dev-shm-usage",
					"--disable-accelerated-2d-canvas",
					"--disable-gpu",
					"--js-flags=--expose-gc", // V8 가비지 컬렉션 노출
				],
			});

			// 메모리 사용량 모니터링 시작
			this.startMemoryMonitoring();

			this.initialized = true;
			logger.info(`크롤러 초기화 완료: ${this.source}`);
		} catch (error) {
			logger.error(`크롤러 초기화 실패: ${this.source}`, error);
			throw new Error(
				`크롤러 초기화 실패: ${this.source}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * 크롤러 종료 메서드
	 * 브라우저 인스턴스를 닫고 리소스를 해제합니다.
	 */
	public async close(): Promise<void> {
		if (!this.initialized && !this.browser) {
			return;
		}

		logger.info(`크롤러 종료 중: ${this.source}`);

		// 메모리 모니터링 중지
		this.stopMemoryMonitoring();

		try {
			if (this.browser) {
				await this.browser.close();
				this.browser = null;
			}
			this.initialized = false;
			logger.info(`크롤러 종료 완료: ${this.source}`);
		} catch (error) {
			logger.error(`크롤러 종료 실패: ${this.source}`, error);
			// 오류가 발생해도 리소스를 해제하기 위해 browser를 null로 설정
			this.browser = null;
			this.initialized = false;
		}
	}

	/**
	 * 메모리 모니터링 시작
	 * 일정 간격으로 메모리 사용량을 기록합니다.
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
				recordMemoryUsage(this.source, heapUsedMB, heapTotalMB);

				// 메모리 사용량이 높은 경우 로그
				if (heapUsedMB > 500) {
					// 500MB 이상일 때
					logger.warn(
						`높은 메모리 사용량 감지: ${this.source}, 힙 사용: ${heapUsedMB}MB/${heapTotalMB}MB`,
					);

					// 가비지 컬렉션 강제 실행 시도
					if (global.gc) {
						global.gc();
						logger.info(`가비지 컬렉션 강제 실행됨: ${this.source}`);
					}
				}
			} catch (error) {
				logger.error(`메모리 모니터링 중 오류: ${this.source}`, error);
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
	 * 새 페이지 생성 메서드
	 * 기본 설정이 적용된 새 브라우저 페이지를 생성합니다.
	 * @returns 설정된 브라우저 페이지
	 */
	protected async createPage(): Promise<Page> {
		if (!this.browser) {
			await this.initialize();
		}

		if (!this.browser) {
			throw new Error(`브라우저 인스턴스가 없습니다: ${this.source}`);
		}

		const page = await this.browser.newPage();

		// 기본 설정
		await page.setUserAgent(this.userAgent);
		await page.setDefaultTimeout(this.timeout);

		// 성능 향상을 위한 최적화
		await page.setRequestInterception(true);
		page.on("request", (request) => {
			// 불필요한 리소스 차단하여 성능 향상
			const resourceType = request.resourceType();
			if (["image", "stylesheet", "font", "media"].includes(resourceType)) {
				request.abort();
			} else {
				request.continue();
			}
		});

		return page;
	}

	/**
	 * 오류 유형 감지 메서드
	 * 발생한 오류의 유형을 분석합니다.
	 * @param error - 발생한 오류
	 * @returns 오류 유형
	 */
	protected detectErrorType(error: Error): ErrorType {
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
	 * 오류 유형에 따라 재시도 가능 여부 결정
	 * @param errorType - 오류 유형
	 * @returns 재시도 가능 여부
	 */
	protected isRetryableError(errorType: ErrorType): boolean {
		// 재시도 가능한 오류 유형
		const retryableErrors = [
			ErrorType.NETWORK,
			ErrorType.TIMEOUT,
			ErrorType.SELECTOR,
		];

		return retryableErrors.includes(errorType);
	}

	/**
	 * 지수 백오프 지연 시간 계산
	 * @param attempt - 시도 횟수 (0부터 시작)
	 * @returns 지연 시간(ms)
	 */
	protected calculateBackoff(attempt: number): number {
		// 지수 백오프: initialDelay * (factor ^ attempt)
		const delay =
			this.retryOptions.initialDelay * this.retryOptions.factor ** attempt;

		// 최대 지연 시간으로 제한
		return Math.min(delay, this.retryOptions.maxDelay);
	}

	/**
	 * 재시도 로직이 포함된 함수 실행 래퍼
	 * @param operation - 실행할 비동기 함수
	 * @param operationName - 작업 이름 (로깅용)
	 * @returns 함수 실행 결과
	 */
	protected async withRetry<T>(
		operation: () => Promise<T>,
		operationName: string,
	): Promise<T> {
		let lastError: Error | null = null;

		for (
			let attempt = 0;
			attempt < this.retryOptions.maxRetries + 1;
			attempt++
		) {
			try {
				if (attempt > 0) {
					logger.info(
						`${operationName} 재시도 중... (시도: ${attempt}/${this.retryOptions.maxRetries})`,
					);
				}

				// 작업 실행
				return await operation();
			} catch (error) {
				const typedError =
					error instanceof Error ? error : new Error(String(error));
				lastError = typedError;

				// 오류 유형 감지
				const errorType = this.detectErrorType(typedError);

				// 재시도 횟수 초과 또는 재시도 불가능한 오류인 경우
				if (
					attempt >= this.retryOptions.maxRetries ||
					!this.isRetryableError(errorType)
				) {
					logger.error(
						`${operationName} 실패 (재시도 ${attempt}/${this.retryOptions.maxRetries}), 오류 유형: ${errorType}`,
						typedError,
					);
					break;
				}

				// 지수 백오프 계산
				const backoffTime = this.calculateBackoff(attempt);
				logger.warn(
					`${operationName} 오류 발생 (유형: ${errorType}), ${backoffTime}ms 후 재시도...`,
					typedError,
				);

				// 지연 시간 대기
				await new Promise((resolve) => setTimeout(resolve, backoffTime));
			}
		}

		// 모든 재시도 실패
		throw lastError || new Error(`${operationName} 작업 실패`);
	}

	/**
	 * 소스 이름 반환 메서드
	 * @returns 크롤러의 소스 이름
	 */
	public getSource(): string {
		return this.source;
	}

	/**
	 * 뉴스 검색 추상 메서드
	 * 모든 크롤러 구현체에서 반드시 구현해야 합니다.
	 */
	public abstract searchNews(
		keyword: string,
		period: string,
		options?: CrawlOptions,
	): Promise<SearchResult>;

	/**
	 * 검색 결과 포맷팅 유틸리티 메서드
	 * 추출된 뉴스 항목을 통일된 검색 결과 형식으로 변환합니다.
	 */
	protected formatSearchResult(
		keyword: string,
		period: string,
		newsItems: NewsItem[],
	): SearchResult {
		return {
			keyword,
			period,
			timestamp: new Date().toISOString(),
			newsItems,
			source: this.source,
		};
	}
}
