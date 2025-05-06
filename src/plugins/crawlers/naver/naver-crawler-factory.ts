import type { CrawlerFactory, NewsCrawler } from "@/core/crawler.interface";
import { NewsSource } from "@/types";
import { logger } from "@/utils/logger";
/**
 * 네이버 뉴스 크롤러 팩토리
 * 네이버 뉴스 크롤러 인스턴스를 생성하는 팩토리 클래스입니다.
 */
import { NaverNewsCrawler } from "./naver-crawler";

/**
 * 네이버 뉴스 크롤러 팩토리 클래스
 * 플러그인 방식으로 네이버 뉴스 크롤러를 생성하기 위한 팩토리 클래스
 */
export class NaverCrawlerFactory implements CrawlerFactory {
	/**
	 * 네이버 뉴스 크롤러 인스턴스 생성
	 * @returns 네이버 뉴스 크롤러 인스턴스
	 */
	public createCrawler(): NewsCrawler {
		logger.debug("네이버 뉴스 크롤러 인스턴스 생성");
		return new NaverNewsCrawler();
	}

	/**
	 * 크롤러 소스 이름 반환
	 * @returns 크롤러 소스 이름
	 */
	public getSource(): string {
		return NewsSource.NAVER;
	}
}
