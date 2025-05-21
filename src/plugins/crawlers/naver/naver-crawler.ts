/**
 * 네이버 뉴스 API 기반 크롤러 구현체
 */
import axios, { type AxiosInstance } from "axios";
import { env } from "@/config/env";
import type {
	CrawlOptions,
	NewsCrawler,
	NewsItem,
	NaverNewsApiItem,
	NaverNewsApiResponse,
	SearchResult,
} from "@/types";
import { logger } from "@/utils/logger";
import { NewsSource } from "@/types"; // NewsSource enum import 추가

/**
 * 네이버 뉴스 API 크롤러
 * NewsCrawler 인터페이스를 구현합니다.
 */
export class NaverCrawler implements NewsCrawler {
	private readonly source: string = NewsSource.NAVER;
	private apiClient: AxiosInstance;
	private readonly clientId: string;
	private readonly clientSecret: string;

	constructor() {
		this.clientId = env.naver.clientId;
		this.clientSecret = env.naver.clientSecret;

		if (!this.clientId || !this.clientSecret) {
			throw new Error(
				"Naver API 클라이언트 ID 또는 시크릿이 설정되지 않았습니다."
			);
		}

		this.apiClient = axios.create({
			baseURL: "https://openapi.naver.com",
			headers: {
				"X-Naver-Client-Id": this.clientId,
				"X-Naver-Client-Secret": this.clientSecret,
				Accept: "application/json", // JSON 응답 선호
			},
			timeout: 10000, // 10초 타임아웃 설정
		});
		logger.debug(`${this.source} 크롤러(API) 인스턴스 생성됨`);
	}

	/**
	 * 초기화 메서드 (API 클라이언트는 생성자에서 초기화되므로 비워둠)
	 */
	public async initialize(): Promise<void> {
		logger.info(`${this.source} 크롤러(API) 초기화 완료 (별도 작업 없음)`);
		// API 클라이언트는 생성자에서 이미 설정됨
		return Promise.resolve();
	}

	/**
	 * 종료 메서드 (별도 리소스 해제 필요 없음)
	 */
	public async close(): Promise<void> {
		logger.info(`${this.source} 크롤러(API) 종료 완료 (별도 작업 없음)`);
		// 특별히 해제할 리소스 없음
		return Promise.resolve();
	}

	/**
	 * 네이버 뉴스 API를 호출하여 뉴스 검색 (페이징 및 기간 처리 포함)
	 * @param keyword - 검색 키워드
	 * @param period - 검색 기간 (예: "1w", "1m", "all", 선택적). 'all' 또는 미지정 시 기간 필터링 안 함.
	 * @param options - 크롤링 옵션 (maxItems는 전체 최대 항목 수로 사용)
	 * @returns 검색 결과 Promise
	 */
	public async searchNews(
		keyword: string,
		period?: string, // period 파라미터 추가
		options?: CrawlOptions
	): Promise<SearchResult> {
		const timestamp = new Date().toISOString();
		// period가 'all'이면 null로 처리하여 기간 필터링 안 함
		const targetPeriod = period === "all" ? undefined : period;
		
		logger.info(
			`[${this.source}] 키워드 "${keyword}" 뉴스 검색 시작... (기간: ${targetPeriod || '전체'})`
		);

		const allNewsItems: NewsItem[] = [];
		const display = 100; // API는 한 번에 최대 100개까지 요청 가능
		let currentStart = 1;
		const maxApiResults = 1000; // 네이버 API 최대 검색 결과 제한
		const maxItemsToCollect = options?.maxItems ?? maxApiResults; // 전체 수집할 최대 아이템 수

		// 기간 문자열을 시작 날짜로 변환하는 로직 (나중에 추가)
		const periodStartDate = this.parsePeriod(targetPeriod); 

		try {
			while (allNewsItems.length < maxItemsToCollect) {
				logger.debug(`[${this.source}] 페이지 요청: start=${currentStart}, display=${display}`);
				const response = await this.apiClient.get<NaverNewsApiResponse>(
					"/v1/search/news.json",
					{
						params: {
							query: keyword,
							display: display,
							start: currentStart,
							sort: "date", // 날짜순으로 정렬
						},
					}
				);

				const apiResult = response.data;
				const fetchedItems = apiResult.items.map(this.mapApiItemToNewsItem);

				if (fetchedItems.length === 0) {
					logger.debug(`[${this.source}] API에서 더 이상 항목을 반환하지 않음. 페이징 종료.`);
					break; // 더 이상 가져올 아이템이 없으면 종료
				}

				let oldestNewsInPage: Date | null = null;

				for (const item of fetchedItems) {
					// 기간 필터링: periodStartDate가 있고, 아이템 날짜가 그 이전이면 중단
					const itemDate = new Date(item.publishedAt);
					if (periodStartDate && itemDate < periodStartDate) {
						logger.debug(`[${this.source}] 기간(${targetPeriod}) 이전 뉴스 발견(${item.publishedAt}). 해당 페이지 처리 중단.`);
						oldestNewsInPage = itemDate; // 해당 페이지에서 가장 오래된 뉴스로 기록하고 루프 탈출
						break; 
					}
					
					// 최대 수집 개수 도달 시 중단
					if (allNewsItems.length < maxItemsToCollect) {
						allNewsItems.push(item);
					} else {
						break; // 내부 루프 탈출
					}
				}

				// 최대 수집 개수에 도달했거나, 기간을 벗어난 뉴스를 발견했다면 페이징 종료
				if (allNewsItems.length >= maxItemsToCollect || oldestNewsInPage) {
					logger.debug(`[${this.source}] 최대 수집 개수(${maxItemsToCollect}) 도달 또는 기간(${targetPeriod}) 벗어남. 페이징 종료.`);
					break;
				}

				// 다음 페이지 시작 위치 계산 및 API 제한 확인
				const nextStart = apiResult.start + apiResult.items.length; // API가 반환한 실제 아이템 수 기준
				if (nextStart > maxApiResults || nextStart >= apiResult.total) {
                    logger.debug(`[${this.source}] API 최대 제한(${maxApiResults}) 또는 전체 결과(${apiResult.total}) 도달. 페이징 종료.`);
					break; // API 제한(1000) 또는 전체 결과 수 도달 시 종료
				}
				
				currentStart = nextStart;

				// 짧은 딜레이 추가 (API 호출 제한 방지) - 필요시 조절
				await new Promise(resolve => setTimeout(resolve, 100)); 
			}

			logger.info(
				`[${this.source}] 키워드 "${keyword}" 검색 완료. ${allNewsItems.length}개 항목 수집.`
			);

			return {
				keyword,
				period: targetPeriod, // 결과에 기간 정보 포함
				timestamp,
				newsItems: allNewsItems,
				source: this.source,
			};
		} catch (error) {
			// 실패 시 빈 결과를 반환하되, 오류 메시지를 포함 (기존 오류 처리 로직 활용)
			let errorMessage = `[${this.source}] 키워드 "${keyword}" ${targetPeriod ? `(기간: ${targetPeriod}) ` : ""}검색 중 오류 발생`;
			if (axios.isAxiosError(error)) {
				if (error.response) {
					// 네이버 API 오류 응답 처리
					const { status, data } = error.response;
					errorMessage += ` - ${status} ${data?.errorMessage || error.message}`;
					logger.error(errorMessage, { errorData: data });
				} else {
					// 네트워크 오류 등
					errorMessage += ` - ${error.message}`;
					logger.error(errorMessage);
				}
			} else {
				errorMessage += ` - ${(error as Error).message}`;
				logger.error(errorMessage, { error });
			}
			
			return {
				keyword,
				period: targetPeriod, // 오류 시에도 기간 정보 포함
				timestamp,
				newsItems: [],
				source: this.source,
				error: errorMessage,
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
		const regex = /^(\d+)([wdm])$/; // 숫자 + (w, d, m)
		const match = period.match(regex);

		if (!match) {
			logger.warn(`[${this.source}] 유효하지 않은 기간 형식: ${period}. 기간 필터링을 적용하지 않습니다.`);
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
				return null; // Should not happen due to regex
		}
		// 계산된 날짜의 시작 시간(00:00:00)으로 설정
		now.setHours(0, 0, 0, 0); 
		return now;
	}

	/**
	 * 크롤러 소스 이름 반환
	 * @returns 크롤러 소스 이름 ("naver")
	 */
	public getSource(): string {
		return this.source;
	}

	/**
	 * Naver API 아이템을 내부 NewsItem 형식으로 변환
	 * @param apiItem - NaverNewsApiItem 객체
	 * @returns NewsItem 객체
	 */
	private mapApiItemToNewsItem(apiItem: NaverNewsApiItem): NewsItem {
		// HTML 태그 제거 함수
		const removeHtmlTags = (str: string) => str.replace(/<\/?b>/g, "");

		// 날짜 형식 변환 (RFC 1123 GMT -> ISO 8601)
		let publishedAt = apiItem.pubDate;
		try {
			publishedAt = new Date(apiItem.pubDate).toISOString();
		} catch (e) {
			logger.warn(
				`[${NewsSource.NAVER}] 날짜 변환 실패: ${apiItem.pubDate}. 원본 형식 유지.`
			);
		}

		return {
			title: removeHtmlTags(apiItem.title),
			url: apiItem.link, // 네이버 뉴스 링크를 기본 URL로 사용
			originalUrl: apiItem.originallink,
			publishedAt: publishedAt,
			description: removeHtmlTags(apiItem.description),
			press: undefined, // API에서 언론사 정보 직접 제공 안 함
		};
	}
} 