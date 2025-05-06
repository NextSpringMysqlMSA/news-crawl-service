import { EventEmitter } from "node:events";
import { env } from "@/config/env";
import {
	recordCrawlingFailure,
	recordCrawlingStart,
} from "@/monitoring/metrics";
import type { CrawlOptions, CrawlRequest, SearchResult } from "@/types";
/**
 * 크롤러 서비스
 * 크롤러 등록, 초기화, 뉴스 검색 등 주요 기능 제공
 */
import { logger } from "@/utils/logger";
import pLimit from "p-limit";
import type { RetryOptions } from "./base-crawler";
import { CrawlerCluster } from "./crawler-cluster";
import type { CrawlerRegistry } from "./crawler-registry";

/**
 * 크롤러 결과 처리 오류
 */
export class CrawlerError extends Error {
	public readonly source: string;
	public readonly keyword: string;
	public readonly period: string;

	constructor(
		message: string,
		source: string,
		keyword: string,
		period: string,
	) {
		super(message);
		this.name = "CrawlerError";
		this.source = source;
		this.keyword = keyword;
		this.period = period;
	}
}

/**
 * 크롤러 서비스 클래스
 * 크롤러 레지스트리를 통해 크롤러를 관리하고 검색 기능 제공
 */
export class CrawlerService extends EventEmitter {
	private registry: CrawlerRegistry;
	private cluster: CrawlerCluster;
	private initialized = false;
	private concurrentLimit: number;

	/**
	 * 이벤트 타입 정의
	 */
	public static readonly EVENTS = {
		INITIALIZED: "initialized",
		CLOSED: "closed",
		SEARCH_STARTED: "search-started",
		SEARCH_COMPLETED: "search-completed",
		SEARCH_FAILED: "search-failed",
		CONCURRENCY_CHANGED: "concurrency-changed",
	};

	/**
	 * 생성자
	 * @param registry - 크롤러 레지스트리 인스턴스
	 * @param cluster - 크롤러 클러스터 인스턴스 (선택적, 제공되지 않으면 내부적으로 생성)
	 * @param customRetryOptions - 재시도 옵션 (선택적)
	 */
	constructor(
		registry: CrawlerRegistry,
		cluster?: CrawlerCluster,
		customRetryOptions?: Partial<RetryOptions>,
	) {
		super();
		this.registry = registry;
		this.concurrentLimit = env.crawler.concurrentLimit;

		// 의존성 주입 패턴 적용: 외부에서 클러스터를 주입받거나 내부적으로 생성
		this.cluster = cluster || new CrawlerCluster(registry, customRetryOptions);

		logger.debug(
			`크롤러 서비스 인스턴스 생성됨 (동시성 제한: ${this.concurrentLimit})`,
		);
	}

	/**
	 * 모든 크롤러 초기화
	 */
	public async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		logger.info("크롤러 서비스 초기화 중...");

		try {
			// 레지스트리 초기화
			await this.registry.initializeAll();

			// 클러스터 초기화
			await this.cluster.initialize(this.concurrentLimit);

			this.initialized = true;
			logger.info("크롤러 서비스 초기화 완료");

			// 이벤트 발생
			this.emit(CrawlerService.EVENTS.INITIALIZED);
		} catch (error) {
			logger.error("크롤러 서비스 초기화 실패", error);
			throw error;
		}
	}

	/**
	 * 모든 크롤러 종료
	 */
	public async close(): Promise<void> {
		if (!this.initialized) {
			return;
		}

		logger.info("크롤러 서비스 종료 중...");

		try {
			// 클러스터 종료
			await this.cluster.close();

			// 레지스트리 종료
			await this.registry.closeAll();

			this.initialized = false;
			logger.info("크롤러 서비스 종료 완료");

			// 이벤트 발생
			this.emit(CrawlerService.EVENTS.CLOSED);
		} catch (error) {
			logger.error("크롤러 서비스 종료 실패", error);
			throw error;
		}
	}

	/**
	 * 사용 가능한 모든 뉴스 소스 목록 반환
	 * @returns 사용 가능한 모든 뉴스 소스 목록
	 */
	public getAvailableSources(): string[] {
		return this.registry.getAvailableSources();
	}

	/**
	 * 특정 소스의 크롤러로 뉴스 검색 (클러스터 활용)
	 * @param source - 크롤러 소스 이름
	 * @param keyword - 검색 키워드
	 * @param period - 검색 기간
	 * @param options - 검색 옵션
	 * @returns 검색 결과
	 * @throws CrawlerError 크롤러 실행 중 오류 발생 시
	 */
	public async searchNewsBySource(
		source: string,
		keyword: string,
		period: string,
		options?: CrawlOptions,
	): Promise<SearchResult> {
		if (!this.initialized) {
			await this.initialize();
		}

		logger.info(
			`소스 ${source}에서 키워드 "${keyword}" 검색 시작 (기간: ${period})`,
		);
		recordCrawlingStart(source);

		// 이벤트 발생
		this.emit(CrawlerService.EVENTS.SEARCH_STARTED, {
			source,
			keyword,
			period,
		});

		const startTime = Date.now();

		try {
			const result = await this.cluster.searchNews(
				source,
				keyword,
				period,
				options,
			);

			// 검색 완료 이벤트
			this.emit(CrawlerService.EVENTS.SEARCH_COMPLETED, {
				source,
				keyword,
				period,
				count: result.newsItems.length,
				duration: (Date.now() - startTime) / 1000,
			});

			return result;
		} catch (error) {
			const durationSeconds = (Date.now() - startTime) / 1000;
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			logger.error(
				`소스 ${source}에서 검색 중 오류 발생 (소요시간: ${durationSeconds.toFixed(2)}초): ${errorMessage}`,
			);
			recordCrawlingFailure(source, durationSeconds);

			// 검색 실패 이벤트
			this.emit(CrawlerService.EVENTS.SEARCH_FAILED, {
				source,
				keyword,
				period,
				error,
				duration: durationSeconds,
			});

			if (error instanceof CrawlerError) {
				throw error;
			}
			throw new CrawlerError(
				`소스 ${source}에서 검색 중 오류 발생: ${errorMessage}`,
				source,
				keyword,
				period,
			);
		}
	}

	/**
	 * 여러 소스에서 뉴스 검색 (병렬 처리)
	 * @param keyword - 검색 키워드
	 * @param period - 검색 기간
	 * @param sources - 검색할 소스 목록 (지정하지 않으면 모든 소스 사용)
	 * @param options - 검색 옵션
	 * @returns 검색 결과와 오류 정보
	 */
	public async searchNews(
		keyword: string,
		period: string,
		sources?: string[],
		options?: CrawlOptions,
	): Promise<{
		results: SearchResult[];
		errors: CrawlerError[];
	}> {
		if (!this.initialized) {
			await this.initialize();
		}

		// 소스가 지정되지 않은 경우 모든 소스 사용
		const targetSources = sources || this.getAvailableSources();

		logger.info(
			`키워드 "${keyword}" 검색 시작 (기간: ${period}, 소스: ${targetSources.join(", ")})`,
		);

		// 동시성 제한 생성
		const limit = pLimit(this.concurrentLimit);

		// 병렬로 모든 소스에서 검색 (동시성 제한 적용)
		const searchPromises = targetSources.map((source) => {
			return limit(async () => {
				try {
					return {
						result: await this.searchNewsBySource(
							source,
							keyword,
							period,
							options,
						),
						error: null,
					};
				} catch (error) {
					logger.error(`소스 ${source}에서 검색 중 오류 발생`, error);
					return {
						result: null,
						error:
							error instanceof CrawlerError
								? error
								: new CrawlerError(
										`소스 ${source}에서 검색 중 예상치 못한 오류 발생`,
										source,
										keyword,
										period,
									),
					};
				}
			});
		});

		const searchOutcomes = await Promise.all(searchPromises);

		// 결과와 오류 분리
		const results = searchOutcomes
			.filter((outcome) => outcome.result !== null)
			.map((outcome) => outcome.result as SearchResult);

		const errors = searchOutcomes
			.filter((outcome) => outcome.error !== null)
			.map((outcome) => outcome.error as CrawlerError);

		const totalNewsItems = results.reduce(
			(sum, result) => sum + result.newsItems.length,
			0,
		);
		logger.info(
			`총 ${totalNewsItems}개의 뉴스 항목을 ${results.length}개 소스에서 찾음`,
		);

		if (errors.length > 0) {
			logger.warn(`${errors.length}개 소스에서 오류 발생`);
		}

		return { results, errors };
	}

	/**
	 * 크롤링 요청 처리
	 * @param request - 크롤링 요청 정보
	 * @returns 검색 결과와 오류 정보
	 */
	public async processCrawlRequest(request: CrawlRequest): Promise<{
		results: SearchResult[];
		errors: CrawlerError[];
	}> {
		const { keyword, periods, sources } = request;

		logger.info(
			`크롤링 요청 처리: 키워드 "${keyword}", 기간 ${periods.join(", ")}, 소스 ${sources?.join(", ") || "전체"}`,
		);

		const allResults: SearchResult[] = [];
		const allErrors: CrawlerError[] = [];

		// 여러 기간에 대한 요청은 순차적으로 처리
		for (const period of periods) {
			const { results, errors } = await this.searchNews(
				keyword,
				period,
				sources,
			);
			allResults.push(...results);
			allErrors.push(...errors);
		}

		return {
			results: allResults,
			errors: allErrors,
		};
	}

	/**
	 * 동시성 제한 값 설정
	 * @param limit - 최대 동시 실행 수
	 */
	public setConcurrentLimit(limit: number): void {
		this.concurrentLimit = limit;
		this.cluster.setConcurrentLimit(limit).catch((error) => {
			logger.error(
				`동시성 제한 변경 실패: ${error instanceof Error ? error.message : String(error)}`,
			);
		});

		logger.info(`크롤러 동시성 제한이 ${limit}로 변경됨`);

		// 이벤트 발생
		this.emit(CrawlerService.EVENTS.CONCURRENCY_CHANGED, { limit });
	}

	/**
	 * 활성 작업 수 반환
	 * @returns 활성 작업 수
	 */
	public getActiveTaskCount(): number {
		return this.cluster.getActiveTaskCount();
	}
}
