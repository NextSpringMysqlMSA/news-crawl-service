import { env } from "@/config/env";
import type { CrawlOptions, SearchResult } from "@/types";
import { ErrorType } from "@/types";
import { logger } from "@/utils/logger";
/**
 * 기본 크롤러 추상 클래스
 * 모든 크롤러 구현체의 기본 기능을 제공합니다.
 */
import puppeteer from "puppeteer";
import type { Browser, Page } from "puppeteer";
import type { NewsCrawler, CrawlerFactory } from "./crawler.interface";
import { AxiosError } from "axios";
import type { NewsItem } from "@/types";

// RetryOptions 인터페이스 정의
export interface RetryOptions {
	maxRetries: number; // 최대 재시도 횟수
	initialDelay: number; // 초기 지연 시간 (ms)
	maxDelay: number; // 최대 지연 시간 (ms)
	factor: number; // 지연 시간 증가 계수 (지수 백오프 시)
}

/**
 * 기본 크롤러 추상 클래스
 * 모든 크롤러 구현체가 상속받아 사용할 수 있는 기본 기능 제공
 */
export abstract class BaseCrawler implements NewsCrawler {
	protected browser: Browser | null = null;
	protected readonly source: string;

	/**
	 * @param source - 크롤러 소스 이름
	 */
	constructor(source: string) {
		this.source = source;
		logger.debug(`${source} 크롤러 인스턴스 생성됨`);
	}

	/**
	 * 브라우저 초기화 메서드
	 * Puppeteer 브라우저 인스턴스 생성 및 설정
	 */
	public async initialize(): Promise<void> {
		logger.info(`${this.source} 크롤러 초기화 중...`);

		try {
			// 브라우저가 이미 초기화되어 있으면 재사용
			if (this.browser) {
				return;
			}

			this.browser = await puppeteer.launch({
				headless: env.crawler.headless,
				args: ["--no-sandbox", "--disable-setuid-sandbox"],
			});

			logger.info(`${this.source} 크롤러 초기화 완료`);
		} catch (error) {
			logger.error(`${this.source} 크롤러 초기화 실패: ${error}`);
			throw error;
		}
	}

	/**
	 * 브라우저 종료 메서드
	 * 사용한 리소스 정리
	 */
	public async close(): Promise<void> {
		logger.info(`${this.source} 크롤러 종료 중...`);

		try {
			if (this.browser) {
				await this.browser.close();
				this.browser = null;
			}

			logger.info(`${this.source} 크롤러 종료 완료`);
		} catch (error) {
			logger.error(`${this.source} 크롤러 종료 실패: ${error}`);
			throw error;
		}
	}

	/**
	 * 새 페이지 생성 및 설정 메서드
	 *
	 * @returns 설정된 Puppeteer Page 객체
	 */
	protected async createPage(): Promise<Page> {
		if (!this.browser) {
			throw new Error(`${this.source} 크롤러가 초기화되지 않았습니다.`);
		}

		const page = await this.browser.newPage();

		// 유저 에이전트 설정
		await page.setUserAgent(env.crawler.userAgent);

		// 타임아웃 설정
		await page.setDefaultNavigationTimeout(env.crawler.timeout);

		return page;
	}

	/**
	 * 크롤러 소스 이름 반환
	 *
	 * @returns 크롤러 소스 이름
	 */
	public getSource(): string {
		return this.source;
	}

	/**
	 * 뉴스 검색 메서드 (추상 메서드)
	 * 각 크롤러 구현체에서 구현해야 함
	 */
	public abstract searchNews(
		keyword: string,
		period?: string,
		options?: CrawlOptions
	): Promise<SearchResult>;
}
