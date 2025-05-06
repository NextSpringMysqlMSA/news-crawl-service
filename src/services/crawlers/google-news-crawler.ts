import { config } from "@/config/config";
import type { CrawlOptions, PeriodMap, SearchResult } from "@/types";
import { NewsSource } from "@/types";
/**
 * 구글 뉴스 RSS 크롤링 서비스
 * axios를 사용하여 구글 뉴스 RSS 피드를 가져와 파싱
 */
import axios from "axios";
import { BaseCrawler } from "../base-crawler";
import { extractNewsItemsFromGoogleNewsRSS } from "../parsers/google-news-parser";

// 검색 기간 매핑
const PERIOD_MAP: PeriodMap = {
	"1w": { pd: "1w", value: "1w" }, // 1주일
	"1m": { pd: "1m", value: "1m" }, // 1개월
	all: { pd: "all", value: "all" }, // 전체기간
};

export class GoogleNewsCrawler extends BaseCrawler {
	/**
	 * 뉴스 소스 이름 반환
	 */
	getSource(): string {
		return NewsSource.GOOGLE_NEWS;
	}

	/**
	 * 브라우저가 필요 없음을 표시
	 */
	protected requiresBrowser(): boolean {
		return false;
	}

	/**
	 * 검색 URL 생성
	 */
	protected buildSearchUrl(keyword: string, period: string): string {
		return config.crawler.googleNewsRssUrlFormat.replace(
			"{keyword}",
			encodeURIComponent(keyword),
		);
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

		try {
			console.log(`구글 뉴스 RSS 요청: ${url}`);
			const response = await axios.get(url, {
				headers: {
					"User-Agent": config.crawler.userAgent,
				},
				responseType: "text",
			});

			// XML을 파싱하여 뉴스 아이템 추출
			const xmlData = response.data;
			const newsItems = await extractNewsItemsFromGoogleNewsRSS(
				xmlData,
				maxItems,
			);

			return {
				keyword,
				period,
				timestamp: new Date().toISOString(),
				newsItems,
				source: this.getSource(),
			};
		} catch (error) {
			console.error("구글 뉴스 RSS 크롤링 중 오류:", error);
			throw error;
		}
	}
}
