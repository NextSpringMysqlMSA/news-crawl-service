import { config } from "@/config/config";
import { BaseCrawler } from "@/core/base-crawler";
import type { CrawlOptions, NewsItem, PeriodMap, SearchResult } from "@/types";
import { NewsSource } from "@/types";
import { logger } from "@/utils/logger";
/**
 * 구글 뉴스 크롤러
 * 구글 뉴스 RSS 피드에서 뉴스 기사를 크롤링합니다.
 */
import axios from "axios";
import { parseStringPromise } from "xml2js";

/**
 * 검색 기간 매핑
 */
const PERIOD_MAP: PeriodMap = {
	"1w": { pd: "1w", value: "1w" }, // 1주일
	"1m": { pd: "1m", value: "1m" }, // 1개월
	all: { pd: "all", value: "all" }, // 전체기간
};

/**
 * 구글 뉴스 크롤러 구현 클래스
 */
export class GoogleNewsCrawler extends BaseCrawler {
	/**
	 * 생성자
	 */
	constructor() {
		super(NewsSource.GOOGLE_NEWS);
	}

	/**
	 * 브라우저 초기화 메서드 오버라이드
	 * 구글 뉴스 RSS는 브라우저가 필요 없으므로 초기화를 무시합니다.
	 */
	public async initialize(): Promise<void> {
		logger.info(`${this.getSource()} 크롤러 초기화 완료 (브라우저 불필요)`);
	}

	/**
	 * 브라우저 종료 메서드 오버라이드
	 * 구글 뉴스 RSS는 브라우저가 필요 없으므로 종료를 무시합니다.
	 */
	public async close(): Promise<void> {
		logger.info(`${this.getSource()} 크롤러 종료 완료 (브라우저 불필요)`);
	}

	/**
	 * 검색 URL 생성
	 * @param keyword - 검색 키워드
	 * @param period - 검색 기간
	 * @returns 검색 URL
	 */
	protected buildSearchUrl(keyword: string, period: string): string {
		return config.crawler.googleNewsRssUrlFormat.replace(
			"{keyword}",
			encodeURIComponent(keyword),
		);
	}

	/**
	 * 구글 뉴스 검색
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
		logger.info(`구글 뉴스 검색: 키워드 "${keyword}", 기간 ${period}`);

		const maxItems = options.maxItems || 20;
		const url = this.buildSearchUrl(keyword, period);

		try {
			logger.debug(`구글 뉴스 RSS 요청: ${url}`);
			const response = await axios.get(url, {
				headers: {
					"User-Agent": config.crawler.userAgent,
				},
				responseType: "text",
				timeout: config.crawler.timeout,
			});

			// XML을 파싱하여 뉴스 아이템 추출
			const xmlData = response.data;
			const newsItems = await this.extractNewsItemsFromGoogleNewsRSS(
				xmlData,
				maxItems,
			);

			logger.info(`구글 뉴스 검색 완료: ${newsItems.length}개 항목 추출`);

			return {
				keyword,
				period,
				timestamp: new Date().toISOString(),
				newsItems,
				source: this.getSource(),
			};
		} catch (error) {
			logger.error("구글 뉴스 RSS 크롤링 중 오류", error);
			throw error;
		}
	}

	/**
	 * 구글 뉴스 RSS에서 뉴스 항목 추출
	 * @param xmlData - XML 데이터
	 * @param maxItems - 최대 추출 항목 수
	 * @returns 뉴스 항목 배열
	 */
	private async extractNewsItemsFromGoogleNewsRSS(
		xmlData: string,
		maxItems: number,
	): Promise<NewsItem[]> {
		try {
			const result = await parseStringPromise(xmlData, {
				explicitArray: false,
				trim: true,
			});

			if (!result?.rss?.channel?.item) {
				logger.warn("구글 뉴스 RSS에서 뉴스 항목을 찾을 수 없음");
				return [];
			}

			// items가 배열이 아니면 배열로 변환
			const items = Array.isArray(result.rss.channel.item)
				? result.rss.channel.item
				: [result.rss.channel.item];

			// 최대 항목 수만큼 추출
			const newsItems: NewsItem[] = [];
			const count = Math.min(items.length, maxItems);

			logger.debug(`구글 뉴스 RSS에서 ${count}개 항목 처리 중`);

			for (let i = 0; i < count; i++) {
				const item = items[i];

				if (!item.title || !item.link) continue;

				// RSS description에서 뉴스 출처 정보 추출
				let press = "";
				let summary = "";

				if (item.source?._) {
					press = item.source._;
				} else if (item.source) {
					press = item.source;
				}

				// description에서 요약 정보 추출 시도
				if (item.description) {
					// description 내의 HTML 태그 제거
					const regex = /<font color="#6f6f6f">([^<]+)<\/font>/;
					const match = regex.exec(item.description);

					if (match?.[1]) {
						press = match[1];
					}

					// HTML 태그 제거
					summary = item.description.replace(/<[^>]*>/g, "");
				}

				// 발행 시간 추출
				const publishedAt = item.pubDate || new Date().toISOString();

				newsItems.push({
					title: item.title,
					url: item.link,
					press,
					publishedAt,
					summary,
				});
			}

			return newsItems;
		} catch (error) {
			logger.error("구글 뉴스 RSS 파싱 중 오류", error);
			return [];
		}
	}
}
