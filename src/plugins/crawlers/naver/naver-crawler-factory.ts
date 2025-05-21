/**
 * NaverCrawler 인스턴스를 생성하는 팩토리 클래스
 */
import type { CrawlerFactory } from "@/core/crawler.interface";
import { type NewsCrawler, NewsSource } from "@/types";
import { NaverCrawler } from "./naver-crawler";

export class NaverCrawlerFactory implements CrawlerFactory {
	/**
	 * NaverCrawler 인스턴스를 생성합니다.
	 * @returns NewsCrawler 인터페이스를 구현한 NaverCrawler 인스턴스
	 */
	createCrawler(): NewsCrawler {
		return new NaverCrawler();
	}

	/**
	 * 크롤러 소스 이름을 반환합니다.
	 * @returns 소스 이름 ("naver")
	 */
	getSource(): string {
		return NewsSource.NAVER;
	}
} 