import { config } from "@/config/config";
import type { CrawlOptions, NewsCrawler, SearchResult } from "@/types";
/**
 * 뉴스 크롤러 추상 기본 클래스
 * 모든 뉴스 소스 크롤러의 공통 기능 제공
 */
import puppeteer, { type Browser, type Page } from "puppeteer";

export abstract class BaseCrawler implements NewsCrawler {
	protected browser: Browser | null = null;

	/**
	 * 크롤러 초기화
	 * 기본 구현은 브라우저 기반 크롤러를 위한 것이며, RSS 기반 크롤러는 오버라이드 할 수 있음
	 */
	async initialize(): Promise<void> {
		if (this.requiresBrowser()) {
			if (this.browser) {
				return;
			}

			this.browser = await puppeteer.launch({
				headless: config.crawler.headless,
				args: ["--no-sandbox", "--disable-setuid-sandbox"],
				timeout: config.crawler.timeout,
			});
		}
	}

	/**
	 * 크롤러 종료
	 */
	async close(): Promise<void> {
		if (this.browser) {
			await this.browser.close();
			this.browser = null;
		}
	}

	/**
	 * 브라우저 필요 여부 - 기본값은 true이며, RSS 기반 크롤러에서 오버라이드 가능
	 */
	protected requiresBrowser(): boolean {
		return true;
	}

	/**
	 * 새 페이지 생성 및 기본 설정
	 */
	protected async createPage(): Promise<Page> {
		if (!this.browser) {
			throw new Error("Browser is not initialized");
		}

		const page = await this.browser.newPage();
		await page.setUserAgent(config.crawler.userAgent);
		await page.setViewport({ width: 1366, height: 768 });
		await page.setDefaultNavigationTimeout(config.crawler.timeout);

		return page;
	}

	/**
	 * 뉴스 소스 이름 반환
	 */
	abstract getSource(): string;

	/**
	 * 검색 URL 생성
	 */
	protected abstract buildSearchUrl(keyword: string, period: string): string;

	/**
	 * 키워드로 뉴스 검색
	 */
	abstract searchNews(
		keyword: string,
		period: string,
		options?: CrawlOptions,
	): Promise<SearchResult>;
}
