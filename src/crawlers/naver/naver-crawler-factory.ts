import { logger } from "@/utils/logger";
/**
 * 네이버 뉴스 크롤러 팩토리
 * 네이버 뉴스 크롤러 인스턴스를 생성하는 팩토리 클래스
 */
import type { CrawlerFactory, NewsCrawler } from "../crawler.interface";
import { NaverCrawler } from "./naver-crawler";

/**
 * 네이버 뉴스 크롤러 팩토리 클래스
 */
export class NaverCrawlerFactory implements CrawlerFactory {
	private static readonly SOURCE = "naver";

	/**
	 * 크롤러 소스 이름 반환
	 * @returns 소스 이름 ('naver')
	 */
	public getSource(): string {
		return NaverCrawlerFactory.SOURCE;
	}

	/**
	 * 네이버 뉴스 크롤러 인스턴스 생성
	 * @returns 새로운 네이버 뉴스 크롤러 인스턴스
	 */
	public createCrawler(): NewsCrawler {
		logger.debug("네이버 뉴스 크롤러 생성");
		return new NaverCrawler();
	}
}
