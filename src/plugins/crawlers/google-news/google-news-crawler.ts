import { config } from "@/config/config";
import { BaseCrawler } from "@/core/base-crawler";
import type { CrawlOptions, NewsItem, SearchResult } from "@/types";
import { NewsSource } from "@/types";
import { logger } from "@/utils/logger";
/**
 * 구글 뉴스 크롤러
 * 구글 뉴스 RSS 피드에서 뉴스 기사를 크롤링합니다.
 */
import axios from "axios";
import { parseStringPromise } from "xml2js";

/**
 * 구글 뉴스 크롤러 구현 클래스
 */
export class GoogleNewsCrawler extends BaseCrawler {
	/**
	 * 생성자
	 */
	constructor() {
		super(NewsSource.GOOGLE_NEWS);
		logger.debug("구글 뉴스 크롤러 인스턴스 생성");
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
	 * @returns 검색 URL
	 */
	protected buildSearchUrl(keyword: string): string {
		const url = config.crawler.googleNewsRssUrlFormat.replace(
			"{keyword}",
			encodeURIComponent(keyword)
		);
		return url;
	}

	/**
	 * 구글 뉴스 검색
	 * @param keyword - 검색 키워드
	 * @param period - 검색 기간 (예: "1w", "1m", "all"). RSS는 기간 필터링을 직접 지원하지 않으므로, 가져온 결과에서 필터링.
	 * @param options - 검색 옵션
	 * @returns 검색 결과
	 */
	public async searchNews(
		keyword: string,
		period?: string,
		options: CrawlOptions = {}
	): Promise<SearchResult> {
		const timestamp = new Date().toISOString();
		const targetPeriod = period === "all" ? undefined : period;
		logger.info(
			`구글 뉴스 검색: 키워드 \"${keyword}\" (기간: ${targetPeriod || '전체'})`
		);

		const maxItems = options.maxItems || 100;
		const url = this.buildSearchUrl(keyword);

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
			const allFetchedItems = await this.extractNewsItemsFromGoogleNewsRSS(
				xmlData,
				maxItems
			);

			logger.info(`구글 뉴스 RSS에서 ${allFetchedItems.length}개 항목 추출 완료`);

			// 기간 필터링 적용
			const periodStartDate = this.parsePeriod(targetPeriod);
			let filteredItems = allFetchedItems;

			if (periodStartDate) {
				filteredItems = allFetchedItems.filter(item => {
					try {
						const itemDate = new Date(item.publishedAt);
						return itemDate >= periodStartDate;
					} catch (e) {
						logger.warn(`[${this.getSource()}] 뉴스 항목 날짜 파싱 오류: ${item.publishedAt}. 필터링에서 제외.`);
						return false;
					}
				});
				logger.info(`기간(${targetPeriod}) 필터링 적용: ${allFetchedItems.length}개 -> ${filteredItems.length}개`);
			}

			return {
				keyword,
				period: targetPeriod,
				timestamp,
				newsItems: filteredItems,
				source: this.getSource(),
			};
		} catch (error) {
			logger.error("구글 뉴스 RSS 크롤링 중 오류", error);
			return {
				keyword,
				period: targetPeriod,
				timestamp,
				newsItems: [],
				source: this.getSource(),
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * 기간 문자열을 파싱하여 시작 날짜 Date 객체로 반환
	 * @param period - 기간 문자열 (예: "1w", "1m", "3d") 또는 undefined
	 * @returns 시작 날짜 Date 객체 또는 null (기간 지정 없을 시)
	 */
	private parsePeriod(period?: string): Date | null {
		if (!period) return null;

		const now = new Date();
		const regex = /^(\d+)([wdm])$/;
		const match = period.match(regex);

		if (!match) {
			logger.warn(`[${this.getSource()}] 유효하지 않은 기간 형식: ${period}. 기간 필터링을 적용하지 않습니다.`);
			return null;
		}

		const value = Number.parseInt(match[1], 10);
		const unit = match[2];

		switch (unit) {
			case 'd':
				now.setDate(now.getDate() - value);
				break;
			case 'w':
				now.setDate(now.getDate() - value * 7);
				break;
			case 'm':
				now.setMonth(now.getMonth() - value);
				break;
			default:
				return null;
		}
		now.setHours(0, 0, 0, 0); 
		return now;
	}

	/**
	 * 구글 뉴스 RSS에서 뉴스 항목 추출
	 * @param xmlData - XML 데이터
	 * @param maxItems - 최대 추출 항목 수
	 * @returns 뉴스 항목 배열
	 */
	private async extractNewsItemsFromGoogleNewsRSS(
		xmlData: string,
		maxItems: number
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

				if (!(item.title && item.link)) {
					continue;
				}

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
				const publishedAt = item.pubDate
					? new Date(item.pubDate).toISOString()
					: new Date().toISOString();

				newsItems.push({
					title: item.title,
					url: item.link,
					press,
					publishedAt,
					description: summary,
				});
			}

			return newsItems;
		} catch (error) {
			logger.error("구글 뉴스 RSS 파싱 중 오류", error);
			return [];
		}
	}
}
