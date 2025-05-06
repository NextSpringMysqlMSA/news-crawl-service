import { config } from "@/config/config";
import { BaseCrawler } from "@/core/base-crawler";
import type { CrawlOptions, NewsItem, PeriodMap, SearchResult } from "@/types";
import { NewsSource } from "@/types";
import { logger } from "@/utils/logger";
/**
 * 네이버 뉴스 크롤러
 * 네이버 뉴스 검색 페이지에서 뉴스 기사를 크롤링합니다.
 */
import type { Page } from "puppeteer";

/**
 * 검색 기간 매핑
 */
const PERIOD_MAP: PeriodMap = {
	"1d": { pd: "4", value: "1d" }, // 1일
	"1w": { pd: "1", value: "1w" }, // 1주일
	"1m": { pd: "2", value: "1m" }, // 1개월
	"3m": { pd: "3", value: "3m" }, // 3개월
	all: { pd: "0", value: "all" }, // 전체기간
};

/**
 * 네이버 뉴스 크롤러 구현 클래스
 */
export class NaverNewsCrawler extends BaseCrawler {
	/**
	 * 생성자
	 */
	constructor() {
		super(NewsSource.NAVER);
	}

	/**
	 * 검색 URL 생성
	 * @param keyword - 검색 키워드
	 * @param period - 검색 기간
	 * @returns 검색 URL
	 */
	protected buildSearchUrl(keyword: string, period: string): string {
		const periodInfo = PERIOD_MAP[period];
		if (!periodInfo) {
			throw new Error(
				`유효하지 않은 기간: ${period}, 유효한 기간: ${Object.keys(PERIOD_MAP).join(", ")}`,
			);
		}

		return config.crawler.naverNewsSearchUrlFormat
			.replace("{keyword}", encodeURIComponent(keyword))
			.replace("{period}", periodInfo.pd)
			.replace("{period_value}", periodInfo.value);
	}

	/**
	 * 네이버 뉴스 검색
	 * @param keyword - 검색 키워드
	 * @param period - 검색 기간
	 * @param options - 검색 옵션
	 * @returns 검색 결과
	 */
	public async searchNews(
		keyword: string,
		period: string,
		options: CrawlOptions = {},
	): Promise<SearchResult> {
		logger.info(`네이버 뉴스 검색: 키워드 "${keyword}", 기간 ${period}`);

		const maxItems = options.maxItems || 20;
		const url = this.buildSearchUrl(keyword, period);

		const page = await this.createPage();
		try {
			logger.debug(`URL 접속: ${url}`);
			await page.goto(url, { waitUntil: "domcontentloaded" });

			// 페이지가 완전히 로드될 때까지 대기
			try {
				await page.waitForSelector(".list_news .bx", {
					timeout: config.crawler.timeout / 2,
				});
				logger.debug("기본 뉴스 리스트 요소 찾음");
			} catch (error) {
				// 기본 셀렉터가 없으면 대체 셀렉터 확인
				await page
					.waitForSelector(".sds-comps-vertical-layout.EPe0s1rCZZ86kDLT_SY2", {
						timeout: config.crawler.timeout / 2,
					})
					.catch(() => {
						logger.warn("기본 또는 상세 뉴스 리스트 요소를 찾을 수 없음");
					});
			}

			// 잠시 대기하여 페이지 완전히 로드되도록 함
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// 뉴스 항목 추출 - 기본 리스트 형식 사용
			let newsItems = await this.extractNewsItemsFromNaverList(page, maxItems);

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
					logger.debug("상세 뉴스 형식 발견, 상세 형식으로 추출 시도");
					newsItems = await this.extractNewsItemsFromNaverDetailFormat(
						page,
						maxItems,
					);
				}
			}

			logger.info(`네이버 뉴스 검색 완료: ${newsItems.length}개 항목 추출`);

			return {
				keyword,
				period,
				timestamp: new Date().toISOString(),
				newsItems,
				source: this.getSource(),
			};
		} catch (error) {
			logger.error("네이버 뉴스 크롤링 중 오류 발생", error);
			throw error;
		} finally {
			await page.close();
		}
	}

	/**
	 * 기본 리스트 형식에서 뉴스 항목 추출
	 * @param page - Puppeteer 페이지 객체
	 * @param maxItems - 최대 추출 항목 수
	 * @returns 뉴스 항목 배열
	 */
	private async extractNewsItemsFromNaverList(
		page: Page,
		maxItems: number,
	): Promise<NewsItem[]> {
		return await page.evaluate((max) => {
			const items: NewsItem[] = [];
			const newsElements = document.querySelectorAll(".list_news .bx");

			for (let i = 0; i < Math.min(newsElements.length, max); i++) {
				const element = newsElements[i];

				const titleElement = element.querySelector(".news_tit");
				if (!titleElement) continue;

				const title = titleElement.textContent?.trim() || "";
				const url = titleElement.getAttribute("href") || "";

				const pressElement = element.querySelector(".press");
				const press = pressElement
					? pressElement.textContent?.trim() || ""
					: "";

				const timeElement = element.querySelector(
					".info_group .time, .info_group span:last-child",
				);
				const publishedAt = timeElement
					? timeElement.textContent?.trim() || ""
					: "";

				const summaryElement = element.querySelector(
					".dsc_wrap .api_txt_lines",
				);
				const summary = summaryElement
					? summaryElement.textContent?.trim() || ""
					: "";

				items.push({ title, url, press, publishedAt, summary });
			}

			return items;
		}, maxItems);
	}

	/**
	 * 상세 형식에서 뉴스 항목 추출
	 * @param page - Puppeteer 페이지 객체
	 * @param maxItems - 최대 추출 항목 수
	 * @returns 뉴스 항목 배열
	 */
	private async extractNewsItemsFromNaverDetailFormat(
		page: Page,
		maxItems: number,
	): Promise<NewsItem[]> {
		return await page.evaluate((max) => {
			const items: NewsItem[] = [];
			const newsElements = document.querySelectorAll(
				".sds-comps-vertical-layout.EPe0s1rCZZ86kDLT_SY2",
			);

			for (let i = 0; i < Math.min(newsElements.length, max); i++) {
				const element = newsElements[i];

				const titleElement = element.querySelector(
					'a[data-cr-area="nws*l.head"]',
				);
				if (!titleElement) continue;

				const title = titleElement.textContent?.trim() || "";
				const url = titleElement.getAttribute("href") || "";

				const pressElement = element.querySelector("span.hsL8fD_XoXuP6VV4EQ9O");
				const press = pressElement
					? pressElement.textContent?.trim() || ""
					: "";

				const timeElement = element.querySelector(
					"span.pb0WkYzTHKfRU8YzP_l4.k4nH8M9eFZGHV1k_IzG3",
				);
				const publishedAt = timeElement
					? timeElement.textContent?.trim() || ""
					: "";

				const summaryElement = element.querySelector(
					"div.QBgQWBsVXoH7dY0vBJ0W",
				);
				const summary = summaryElement
					? summaryElement.textContent?.trim() || ""
					: "";

				items.push({ title, url, press, publishedAt, summary });
			}

			return items;
		}, maxItems);
	}
}
