/**
 * 뉴스 크롤러 매니저
 * 여러 뉴스 사이트 크롤러를 통합 관리
 */
import type {
	CrawlOptions,
	CrawlRequest,
	NewsCrawler,
	SearchResult,
} from "@/types";
import { NewsSource } from "@/types";
import { GoogleNewsCrawler } from "./crawlers/google-news-crawler";
import { NaverNewsCrawler } from "./crawlers/naver-crawler";

export class NewsCrawlerManager {
	private crawlers = new Map<string, NewsCrawler>();
	private initialized = false;

	constructor() {
		this.registerCrawler(new NaverNewsCrawler());
		this.registerCrawler(new GoogleNewsCrawler());
	}

	/**
	 * 크롤러 등록
	 */
	registerCrawler(crawler: NewsCrawler): void {
		this.crawlers.set(crawler.getSource(), crawler);
	}

	/**
	 * 모든 크롤러 초기화
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		const initPromises = Array.from(this.crawlers.values()).map((crawler) =>
			crawler.initialize(),
		);
		await Promise.all(initPromises);
		this.initialized = true;
	}

	/**
	 * 모든 크롤러 종료
	 */
	async close(): Promise<void> {
		if (!this.initialized) {
			return;
		}

		const closePromises = Array.from(this.crawlers.values()).map((crawler) =>
			crawler.close(),
		);
		await Promise.all(closePromises);
		this.initialized = false;
	}

	/**
	 * 특정 뉴스 소스의 크롤러 가져오기
	 */
	getCrawler(source: string): NewsCrawler | undefined {
		return this.crawlers.get(source);
	}

	/**
	 * 사용 가능한 모든 뉴스 소스 목록 반환
	 */
	getAvailableSources(): string[] {
		return Array.from(this.crawlers.keys());
	}

	/**
	 * 단일 소스에서 뉴스 검색
	 */
	async searchNewsBySource(
		source: string,
		keyword: string,
		period: string,
		options?: CrawlOptions,
	): Promise<SearchResult> {
		if (!this.initialized) {
			await this.initialize();
		}

		const crawler = this.getCrawler(source);
		if (!crawler) {
			throw new Error(`크롤러를 찾을 수 없습니다: ${source}`);
		}

		return crawler.searchNews(keyword, period, options);
	}

	/**
	 * 여러 소스에서 뉴스 검색
	 */
	async searchNews(
		keyword: string,
		period: string,
		sources?: string[],
		options?: CrawlOptions,
	): Promise<SearchResult[]> {
		if (!this.initialized) {
			await this.initialize();
		}

		const targetSources = sources || this.getAvailableSources();

		const searchPromises = targetSources.map(async (source) => {
			try {
				const crawler = this.getCrawler(source);
				if (!crawler) {
					throw new Error(`크롤러를 찾을 수 없습니다: ${source}`);
				}

				return crawler.searchNews(keyword, period, options);
			} catch (error) {
				console.error(`소스 ${source}에서 검색 중 오류 발생:`, error);
				return {
					keyword,
					period,
					timestamp: new Date().toISOString(),
					newsItems: [],
					source,
				};
			}
		});

		return Promise.all(searchPromises);
	}

	/**
	 * 크롤링 요청 처리
	 */
	async processCrawlRequest(request: CrawlRequest): Promise<SearchResult[]> {
		const { keyword, periods, sources } = request;
		let allResults: SearchResult[] = [];

		for (const period of periods) {
			const results = await this.searchNews(keyword, period, sources);
			allResults = allResults.concat(results);
		}

		return allResults;
	}
}
