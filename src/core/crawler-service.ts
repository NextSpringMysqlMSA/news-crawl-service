import { env } from "@/config/env";
import {
	recordCrawlingFailure,
	recordCrawlingStart,
	recordCrawlingSuccess,
} from "@/monitoring/metrics";
import type { CrawlOptions, CrawlRequest, SearchResult } from "@/types";
import { CrawlerError, ErrorType } from "@/types";
import { logger } from "@/utils/logger";
import pLimit from "p-limit";
import type { CrawlerRegistry } from "./crawler-registry";

/**
 * 크롤러 서비스
 * 크롤러 등록, 초기화, 뉴스 검색 등 주요 기능 제공
 */

/**
 * 크롤러 서비스 클래스
 * 크롤러 레지스트리를 통해 크롤러를 관리하고 검색 기능 제공
 */
export class CrawlerService {
	private registry: CrawlerRegistry;
	private initialized = false;
	private concurrentLimit: number;

	/**
	 * 생성자
	 * @param registry - 크롤러 레지스트리 인스턴스
	 */
	constructor(registry: CrawlerRegistry) {
		this.registry = registry;
		this.concurrentLimit = env.crawler.concurrentLimit;
		logger.debug(
			`크롤러 서비스 인스턴스 생성됨 (동시성 제한: ${this.concurrentLimit})`
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
			await this.registry.initializeAll();
			this.initialized = true;
			logger.info("크롤러 서비스 초기화 완료");
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
			await this.registry.closeAll();
			this.initialized = false;
			logger.info("크롤러 서비스 종료 완료");
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
	 * 특정 소스의 크롤러로 뉴스 검색
	 * @param source - 크롤러 소스 이름
	 * @param keyword - 검색 키워드
	 * @param period - 검색 기간 (선택적)
	 * @param options - 검색 옵션
	 * @returns 검색 결과
	 */
	public async searchNewsBySource(
		source: string,
		keyword: string,
		period?: string,
		options?: CrawlOptions
	): Promise<SearchResult> {
		if (!this.initialized) {
			await this.initialize();
		}

		logger.info(
			`소스 ${source}에서 키워드 "${keyword}" 검색 시작 (기간: ${period || '전체'})`
		);
		recordCrawlingStart(source);

		const startTime = Date.now();

		try {
			const crawler = this.registry.getCrawler(source);
			if (!crawler) {
				const errorMsg = `크롤러를 찾을 수 없습니다: ${source}`;
				logger.error(errorMsg);
				recordCrawlingFailure(source, (Date.now() - startTime) / 1000);
				return {
					keyword,
					period,
					timestamp: new Date().toISOString(),
					newsItems: [],
					source,
					error: errorMsg,
				};
			}

			const result = await crawler.searchNews(keyword, period, options);
			const durationSeconds = (Date.now() - startTime) / 1000;

			logger.info(
				`소스 ${source}에서 ${result.newsItems.length}개의 뉴스 항목 찾음 (소요시간: ${durationSeconds.toFixed(2)}초, 기간: ${result.period || '전체'})`
			);
			recordCrawlingSuccess(source, durationSeconds, result.newsItems.length);

			return result;
		} catch (error) {
			const durationSeconds = (Date.now() - startTime) / 1000;
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(
				`소스 ${source}에서 검색 중 오류 발생 (소요시간: ${durationSeconds.toFixed(2)}초, 기간: ${period || '전체'})`,
				error
			);
			recordCrawlingFailure(source, durationSeconds);
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
	 * 여러 소스에서 뉴스 검색 (병렬 처리)
	 * @param keyword - 검색 키워드
	 * @param period - 검색 기간 (선택적)
	 * @param sources - 검색할 소스 목록 (지정하지 않으면 모든 소스 사용)
	 * @param options - 검색 옵션
	 * @returns 검색 결과 배열
	 */
	public async searchNews(
		keyword: string,
		period?: string,
		sources?: string[],
		options?: CrawlOptions
	): Promise<SearchResult[]> {
		if (!this.initialized) {
			await this.initialize();
		}

		const targetSources = sources || this.getAvailableSources();

		logger.info(
			`키워드 "${keyword}" 검색 시작 (소스: ${targetSources.join(", ")}, 기간: ${period || '전체'})`
		);

		const limit = pLimit(this.concurrentLimit);

		const searchPromises = targetSources.map((source) => {
			return limit(async () => {
				return this.searchNewsBySource(source, keyword, period, options);
			});
		});

		const results = await Promise.all(searchPromises);

		const totalNewsItems = results.reduce(
			(sum, result) => sum + result.newsItems.length,
			0
		);
		logger.info(
			`총 ${totalNewsItems}개의 뉴스 항목을 ${results.length}개 소스에서 찾음 (기간: ${period || '전체'})`
		);

		return results;
	}

	/**
	 * 크롤링 요청 처리
	 * @param request - 크롤링 요청 정보
	 * @returns 검색 결과 배열
	 */
	public async processCrawlRequest(
		request: CrawlRequest
	): Promise<SearchResult[]> {
		const { keyword, periods, sources } = request;
		const periodToUse = periods && periods.length > 0 ? periods[0] : undefined;

		logger.info(
			`크롤링 요청 처리: 키워드="${keyword}", 기간=${periodToUse || '전체'}, 소스=${sources?.join(",") || "all"}`
		);

		return this.searchNews(keyword, periodToUse, sources, {});
	}

	/**
	 * 동시성 제한 값 설정
	 * @param limit - 최대 동시 실행 수
	 */
	public setConcurrentLimit(limit: number): void {
		this.concurrentLimit = limit;
		logger.info(`크롤러 동시성 제한이 ${limit}로 변경됨`);
	}
}
