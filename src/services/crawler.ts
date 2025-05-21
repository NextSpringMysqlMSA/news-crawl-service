import { env } from "@/config/env";
import type { CrawlOptions, NewsItem, PeriodMap, SearchResult } from "@/types";
/**
 * 네이버 뉴스 크롤링 서비스
 * Puppeteer를 사용하여 네이버 뉴스 검색 결과를 크롤링
 */
import puppeteer, { type Browser, type Page } from "puppeteer";
import {
	extractNewsItemsFromDetailFormat,
	extractNewsItemsFromList,
} from "./html-parser";

// 검색 기간 매핑
const PERIOD_MAP: PeriodMap = {
	// "1w": { pd: "1", value: "1w" }, // 1주일 - 제거
	// "1m": { pd: "2", value: "1m" }, // 1개월 - 제거
	// all: { pd: "0", value: "all" }, // 전체기간 - 제거
};

export class NaverNewsCrawler {
	private browser: Browser | null = null;

	/**
	 * 크롤러 초기화
	 */
	async initialize(): Promise<void> {
		if (this.browser) {
			return;
		}

		this.browser = await puppeteer.launch({
			headless: env.crawler.headless,
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
			timeout: env.crawler.timeout,
		});
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
	 * 새 페이지 생성 및 기본 설정
	 */
	private async createPage(): Promise<Page> {
		if (!this.browser) {
			throw new Error("Browser is not initialized");
		}

		const page = await this.browser.newPage();
		await page.setUserAgent(env.crawler.userAgent);
		await page.setViewport({ width: 1366, height: 768 });
		await page.setDefaultNavigationTimeout(env.crawler.timeout);

		return page;
	}

	/**
	 * 검색 URL 생성
	 */
	private buildSearchUrl(keyword: string /*, period: string */): string { // period 제거
		// const periodInfo = PERIOD_MAP[period]; // 제거
		// if (!periodInfo) { // 제거
		// 	throw new Error(`Invalid period: ${period}`); // 제거
		// } // 제거

		return env.crawler.naverNewsSearchUrlFormat
			.replace("{keyword}", encodeURIComponent(keyword))
			// .replace("{period}", periodInfo.pd) // 제거
			// .replace("{period_value}", periodInfo.value); // 제거
			// 기간 관련 URL 파라미터가 필요하다면 기본값 설정 또는 수정 필요
			// 예시: .replace("{period}", "0").replace("{period_value}", "all")
			// 여기서는 임시로 삭제 처리.
	}

	/**
	 * 키워드로 뉴스 검색
	 */
	async searchNews(
		keyword: string,
		// period: string, - 제거
		options: CrawlOptions = {}
	): Promise<SearchResult> {
		const maxItems = options.maxItems || 20;
		const url = this.buildSearchUrl(keyword /*, period */); // period 제거

		const page = await this.createPage();
		try {
			await page.goto(url, { waitUntil: "domcontentloaded" });

			try {
				await page.waitForSelector(".list_news .bx", {
					timeout: env.crawler.timeout / 2,
				});
			} catch (_error) {
				await page
					.waitForSelector(".sds-comps-vertical-layout.EPe0s1rCZZ86kDLT_SY2", {
						timeout: env.crawler.timeout / 2,
					})
					.catch(() => {});
			}

			await new Promise((resolve) => setTimeout(resolve, 1000));

			let newsItems = await extractNewsItemsFromList(page, maxItems);

			if (newsItems.length === 0) {
				const hasDetailFormat = await page.evaluate(() => {
					return (
						document.querySelectorAll(
							".sds-comps-vertical-layout.EPe0s1rCZZ86kDLT_SY2"
						).length > 0
					);
				});

				if (hasDetailFormat) {
					newsItems = await extractNewsItemsFromDetailFormat(page, maxItems);
				}
			}

			return {
				keyword,
				// period, - 제거
				timestamp: new Date().toISOString(),
				newsItems,
				source: "naver",
			};
		} finally {
			await page.close();
		}
	}
}
