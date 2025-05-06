/**
 * 애플리케이션에서 사용되는 타입 정의
 */

// 뉴스 기사 타입 정의
export interface NewsItem {
	title: string; // 뉴스 제목
	url: string; // 뉴스 URL
	press: string; // 언론사
	publishedAt: string; // 발행 시간
	summary?: string; // 요약
}

// 키워드 검색 결과 타입
export interface SearchResult {
	keyword: string; // 검색 키워드
	period: string; // 검색 기간 (1w, 1m, all 등)
	timestamp: string; // 검색 시간
	newsItems: NewsItem[]; // 검색된 뉴스 아이템 목록
	source: string; // 뉴스 소스 (naver, google-news 등)
}

// 크롤링 요청 타입
export interface CrawlRequest {
	keyword: string; // 검색할 키워드
	periods: string[]; // 검색 기간 목록 (1w, 1m, all 등)
	sources?: string[]; // 크롤링할 뉴스 소스 (미지정 시 모든 소스)
}

// 크롤링 옵션 타입
export interface CrawlOptions {
	maxItems?: number; // 최대 크롤링 아이템 수 (기본값: 20)
}

// 기간 매핑 타입
export type PeriodMap = Record<string, { pd: string; value: string }>;

// 뉴스 소스 타입 (네이버, 구글 뉴스 등)
export enum NewsSource {
	NAVER = "naver",
	GOOGLE_NEWS = "google-news",
}

// 크롤러 인터페이스
export interface NewsCrawler {
	// 크롤러 초기화
	initialize(): Promise<void>;

	// 크롤러 종료
	close(): Promise<void>;

	// 뉴스 검색
	searchNews(
		keyword: string,
		period: string,
		options?: CrawlOptions,
	): Promise<SearchResult>;

	// 소스 이름 반환
	getSource(): string;
}
