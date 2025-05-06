import { config } from "@/config/config";
import type { CrawlOptions, NewsItem, PeriodMap, SearchResult } from "@/types";
import { NewsSource } from "@/types";
/**
 * 네이버 뉴스 크롤링 서비스
 * Puppeteer를 사용하여 네이버 뉴스 검색 결과를 크롤링
 */
import type { Page } from "puppeteer";
import { BaseCrawler } from "../base-crawler";
import {
	extractNewsItemsFromNaverDetailFormat,
	extractNewsItemsFromNaverList,
} from "../parsers/naver-parser";

// 검색 기간 매핑
const PERIOD_MAP: PeriodMap = {
	"1w": { pd: "1", value: "1w" }, // 1주일
	"1m": { pd: "2", value: "1m" }, // 1개월
	all: { pd: "0", value: "all" }, // 전체기간
};

export class NaverNewsCrawler extends BaseCrawler {
	/**
	 * 뉴스 소스 이름 반환
	 */
	getSource(): string {
		return NewsSource.NAVER;
	}

	/**
	 * 검색 URL 생성
	 */
	protected buildSearchUrl(keyword: string, period: string): string {
		const periodInfo = PERIOD_MAP[period];
		if (!periodInfo) {
			throw new Error(`Invalid period: ${period}`);
		}

		return config.crawler.naverNewsSearchUrlFormat
			.replace("{keyword}", encodeURIComponent(keyword))
			.replace("{period}", periodInfo.pd)
			.replace("{period_value}", periodInfo.value);
	}

	/**
	 * 키워드로 뉴스 검색
	 */
	async searchNews(
		keyword: string,
		period: string,
		options: CrawlOptions = {},
	): Promise<SearchResult> {
		const maxItems = options.maxItems || 20;
		const url = this.buildSearchUrl(keyword, period);

		const page = await this.createPage();
		try {
			await page.goto(url, { waitUntil: "domcontentloaded" });

			// 페이지가 완전히 로드될 때까지 대기
			try {
				await page.waitForSelector(".list_news .bx", {
					timeout: config.crawler.timeout / 2,
				});
			} catch (error) {
				// 기본 셀렉터가 없으면 대체 셀렉터 확인
				await page
					.waitForSelector(".sds-comps-vertical-layout.EPe0s1rCZZ86kDLT_SY2", {
						timeout: config.crawler.timeout / 2,
					})
					.catch(() => {
						console.log("기본 뉴스 리스트 요소를 찾을 수 없습니다.");
					});
			}

			// 잠시 대기하여 페이지 완전히 로드되도록 함
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// 뉴스 항목 추출 - 기본 리스트 형식 사용
			let newsItems = await extractNewsItemsFromNaverList(page, maxItems);

			// 상세 형식 추출 시도 (리스트 형식이 비어있거나 상세 형식이 있는 경우)
			if (newsItems.length === 0) {
				// 상세 뉴스 항목 선택자 확인
				const hasDetailFormat = await page.evaluate(() => {
					return (
						document.querySelectorAll(
							".sds-comps-vertical-layout.EPe0s1rCZZ86kDLT_SY2",
						).length > 0
					);
				});

				if (hasDetailFormat) {
					newsItems = await extractNewsItemsFromNaverDetailFormat(
						page,
						maxItems,
					);
				}
			}

			return {
				keyword,
				period,
				timestamp: new Date().toISOString(),
				newsItems,
				source: this.getSource(),
			};
		} finally {
			await page.close();
		}
	}
}
