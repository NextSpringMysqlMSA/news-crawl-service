/**
 * 뉴스 크롤러 인터페이스 정의
 * 모든 크롤러 구현체가 따라야 할 인터페이스 및 팩토리 패턴 정의
 */
import type { CrawlOptions, SearchResult } from "@/types";

/**
 * 뉴스 크롤러 인터페이스
 * 모든 뉴스 크롤러 구현체가 구현해야 하는 메서드 정의
 */
export interface NewsCrawler {
	/**
	 * 크롤러 초기화
	 * 브라우저 인스턴스 생성, 연결 설정 등 초기화 작업 수행
	 */
	initialize(): Promise<void>;

	/**
	 * 크롤러 종료
	 * 사용한 리소스 해제, 연결 종료 등 정리 작업 수행
	 */
	close(): Promise<void>;

	/**
	 * 뉴스 검색 기능
	 * 주어진 키워드와 기간으로 뉴스를 검색
	 *
	 * @param keyword - 검색할 키워드
	 * @param period - 검색 기간 (1d, 1w, 1m, all 등)
	 * @param options - 추가 검색 옵션
	 * @returns 검색 결과
	 */
	searchNews(
		keyword: string,
		period: string,
		options?: CrawlOptions,
	): Promise<SearchResult>;

	/**
	 * 크롤러 소스 이름 반환
	 *
	 * @returns 크롤러의 소스 이름 (예: 'naver', 'google-news')
	 */
	getSource(): string;
}

/**
 * 크롤러 팩토리 인터페이스
 * 플러그인 방식으로 크롤러를 생성하기 위한 팩토리 패턴 인터페이스
 */
export interface CrawlerFactory {
	/**
	 * 크롤러 인스턴스 생성
	 *
	 * @returns 크롤러 인스턴스
	 */
	createCrawler(): NewsCrawler;

	/**
	 * 크롤러 소스 이름 반환
	 *
	 * @returns 크롤러의 소스 이름
	 */
	getSource(): string;
}
