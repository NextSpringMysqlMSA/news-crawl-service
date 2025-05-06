import { env } from "@/config/env";
import type { CrawlOptions, NewsItem, SearchResult } from "@/types";
import { logger } from "@/utils/logger";
import type { Page } from "puppeteer";
/**
 * 네이버 뉴스 크롤러 구현
 * 네이버 뉴스 검색을 통해 뉴스 데이터를 수집합니다.
 * 향상된 오류 처리와 재시도 메커니즘을 활용합니다.
 */
import { BaseCrawler } from "../base-crawler";

// 네이버 검색 기간 매핑
interface PeriodInfo {
	pd: string;
	value: string;
}

const PERIOD_MAP: Record<string, PeriodInfo> = {
	"1d": { pd: "4", value: "1d" }, // 1일
	"1w": { pd: "1", value: "1w" }, // 1주일
	"1m": { pd: "2", value: "1m" }, // 1개월
	"3m": { pd: "3", value: "3m" }, // 3개월
	"6m": { pd: "6", value: "6m" }, // 6개월
	"1y": { pd: "7", value: "1y" }, // 1년
	all: { pd: "0", value: "all" }, // 전체기간
};

/**
 * 네이버 뉴스 크롤러 클래스
 */
export class NaverCrawler extends BaseCrawler {
	/**
	 * 생성자
	 */
	constructor() {
		super("naver");
		logger.debug("네이버 뉴스 크롤러 인스턴스 생성됨");
	}

	/**
	 * 검색 URL 생성
	 * @param keyword - 검색 키워드
	 * @param period - 검색 기간
	 * @returns 검색 URL
	 */
	private getSearchUrl(keyword: string, period: string): string {
		const periodInfo = PERIOD_MAP[period];
		if (!periodInfo) {
			throw new Error(
				`유효하지 않은 기간: ${period}, 유효한 기간: ${Object.keys(PERIOD_MAP).join(", ")}`,
			);
		}

		return env.crawler.naverNewsSearchUrlFormat
			.replace("{keyword}", encodeURIComponent(keyword))
			.replace("{period}", periodInfo.pd)
			.replace("{period_value}", periodInfo.value);
	}

	/**
	 * 뉴스 항목 추출
	 * @param page - 브라우저 페이지 인스턴스
	 * @param maxItems - 최대 추출 항목 수
	 * @returns 추출된 뉴스 항목 배열
	 */
	private async extractNewsItems(
		page: Page,
		maxItems: number,
	): Promise<NewsItem[]> {
		return await this.withRetry(async () => {
			// 목록 뉴스 요소가 로드될 때까지 대기
			await page
				.waitForSelector(".list_news", {
					timeout: this.timeout / 2,
				})
				.catch(async () => {
					// 기본 셀렉터가 없는 경우 대체 셀렉터 확인
					await page
						.waitForSelector(".news_wrap", {
							timeout: this.timeout / 2,
						})
						.catch(() => {
							logger.debug(
								"네이버 뉴스 목록 요소를 찾을 수 없습니다. 다른 형식 확인 중...",
							);
						});
				});

			// 잠시 대기하여 페이지가 완전히 로드되도록 함
			await new Promise((resolve) => setTimeout(resolve, 500));

			// 브라우저 내에서 데이터 추출 실행
			const newsItems = await page.evaluate((max) => {
				const items: NewsItem[] = [];

				// 뉴스 목록 요소 선택 (여러 형식 지원)
				const newsElements = document.querySelectorAll(
					".list_news .bx, .news_wrap .news_area",
				);

				// 각 뉴스 요소에서 데이터 추출
				for (let i = 0; i < Math.min(newsElements.length, max); i++) {
					const element = newsElements[i];

					try {
						// 제목과 링크 추출 (여러 형식 지원)
						const titleElement = element.querySelector(
							".news_tit, .news_title a",
						);
						if (!titleElement) continue;

						const title = titleElement.textContent?.trim() || "";
						const url = titleElement.getAttribute("href") || "";

						// 요약 추출
						const descElement = element.querySelector(
							".dsc_txt_wrap, .news_dsc",
						);
						const summary = descElement?.textContent?.trim() || "";

						// 언론사 추출
						const pressElement = element.querySelector(
							".press, .info_group .press",
						);
						const press = pressElement?.textContent?.trim() || "";

						// 날짜 추출
						const dateElement = element.querySelector(
							".info_group .info, .info_group .time",
						);
						const publishedAt =
							dateElement?.textContent?.trim() || new Date().toISOString();

						// 결과에 추가
						if (title && url) {
							items.push({
								title,
								url,
								press,
								publishedAt,
								summary,
							});
						}
					} catch (error) {
						console.error("뉴스 항목 추출 중 오류:", error);
					}
				}

				return items;
			}, maxItems);

			return newsItems;
		}, "네이버 뉴스 항목 추출");
	}

	/**
	 * 뉴스 검색 메서드
	 * @param keyword - 검색 키워드
	 * @param period - 검색 기간
	 * @param options - 검색 옵션
	 * @returns 검색 결과
	 */
	public async searchNews(
		keyword: string,
		period: string,
		options?: CrawlOptions,
	): Promise<SearchResult> {
		const searchUrl = this.getSearchUrl(keyword, period);
		logger.debug(`네이버 뉴스 검색 URL: ${searchUrl}`);

		const maxItems = options?.maxItems || 20;

		return await this.withRetry(async () => {
			const page = await this.createPage();

			try {
				// URL로 이동
				await page.goto(searchUrl, {
					waitUntil: "domcontentloaded",
					timeout: this.timeout,
				});

				// 뉴스 항목 추출
				const newsItems = await this.extractNewsItems(page, maxItems);

				logger.info(
					`네이버 뉴스에서 ${newsItems.length}개의 뉴스 항목 추출 완료 (키워드: ${keyword}, 기간: ${period})`,
				);

				return this.formatSearchResult(keyword, period, newsItems);
			} finally {
				await page.close();
			}
		}, `네이버 뉴스 검색 (키워드: ${keyword}, 기간: ${period})`);
	}
}
