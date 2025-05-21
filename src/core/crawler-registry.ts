/**
 * 크롤러 레지스트리
 * 플러그인 방식으로 크롤러를 등록하고 관리하는 클래스
 */
import { logger } from "@/utils/logger";
import type { CrawlerFactory, NewsCrawler } from "@/core/crawler.interface";

/**
 * 크롤러 레지스트리 클래스
 * 모든 크롤러 팩토리를 등록하고 크롤러 인스턴스를 관리
 */
export class CrawlerRegistry {
	private static instance: CrawlerRegistry;
	private factories: Map<string, CrawlerFactory> = new Map();
	private crawlers: Map<string, NewsCrawler> = new Map();

	/**
	 * 싱글톤 인스턴스 접근자
	 * @returns CrawlerRegistry 싱글톤 인스턴스
	 */
	public static getInstance(): CrawlerRegistry {
		if (!CrawlerRegistry.instance) {
			CrawlerRegistry.instance = new CrawlerRegistry();
		}

		return CrawlerRegistry.instance;
	}

	/**
	 * 생성자 (private으로 외부에서 직접 인스턴스화 방지)
	 */
	private constructor() {
		logger.debug("크롤러 레지스트리 인스턴스 생성됨");
	}

	/**
	 * 크롤러 팩토리 등록
	 * @param factory - 등록할 크롤러 팩토리
	 * @returns 등록된 크롤러 팩토리의 소스 이름
	 */
	public registerFactory(factory: CrawlerFactory): string {
		const source = factory.getSource();

		if (this.factories.has(source)) {
			logger.warn(`이미 등록된 크롤러 팩토리가 있습니다: ${source}`);
			return source;
		}

		this.factories.set(source, factory);
		logger.info(`크롤러 팩토리 등록됨: ${source}`);
		return source;
	}

	/**
	 * 크롤러 팩토리 등록 취소
	 * @param source - 등록 취소할 크롤러 소스
	 * @returns 성공 여부
	 */
	public unregisterFactory(source: string): boolean {
		if (!this.factories.has(source)) {
			logger.warn(`등록되지 않은 크롤러 팩토리입니다: ${source}`);
			return false;
		}

		// 크롤러가 생성되어 있다면 종료 처리
		if (this.crawlers.has(source)) {
			const crawler = this.crawlers.get(source);
			if (crawler) {
				crawler.close().catch((error) => {
					logger.error(`크롤러 종료 중 오류 발생: ${source}`, error);
				});
			}
			this.crawlers.delete(source);
		}

		this.factories.delete(source);
		logger.info(`크롤러 팩토리 등록 취소됨: ${source}`);
		return true;
	}

	/**
	 * 크롤러 인스턴스 가져오기
	 * @param source - 크롤러 소스 이름
	 * @returns 크롤러 인스턴스 또는 undefined (없는 경우)
	 */
	public getCrawler(source: string): NewsCrawler | undefined {
		// 이미 생성된 크롤러가 있으면 반환
		if (this.crawlers.has(source)) {
			return this.crawlers.get(source);
		}

		// 등록된 팩토리가 있으면 크롤러 생성
		const factory = this.factories.get(source);
		if (factory) {
			const crawler = factory.createCrawler();
			this.crawlers.set(source, crawler);
			return crawler;
		}

		logger.warn(`요청한 크롤러를 찾을 수 없습니다: ${source}`);
		return undefined;
	}

	/**
	 * 모든 크롤러 인스턴스 가져오기
	 * @returns 모든 크롤러 인스턴스 배열
	 */
	public getAllCrawlers(): NewsCrawler[] {
		// 모든 등록된 팩토리의 크롤러 인스턴스 생성
		for (const [source, factory] of this.factories.entries()) {
			if (!this.crawlers.has(source)) {
				const crawler = factory.createCrawler();
				this.crawlers.set(source, crawler);
			}
		}

		return Array.from(this.crawlers.values());
	}

	/**
	 * 등록된 모든 소스 이름 가져오기
	 * @returns 등록된 모든 소스 이름 배열
	 */
	public getAvailableSources(): string[] {
		return Array.from(this.factories.keys());
	}

	/**
	 * 모든 크롤러 초기화
	 */
	public async initializeAll(): Promise<void> {
		const crawlers = this.getAllCrawlers();
		const initPromises = crawlers.map(async (crawler) => {
			try {
				await crawler.initialize();
				return crawler.getSource(); // 성공한 소스 반환
			} catch (error) {
				logger.error(`크롤러 초기화 실패: ${crawler.getSource()}`, error);
				// 초기화 실패 시 null 반환
				return null;
			}
		});

		const results = await Promise.all(initPromises);
		const successCount = results.filter(Boolean).length;

		logger.info(`크롤러 초기화 완료: ${successCount}/${crawlers.length} 성공`);

		if (successCount < crawlers.length) {
			logger.warn(
				`일부 크롤러 초기화 실패: ${crawlers.length - successCount}개`
			);
		}
	}

	/**
	 * 모든 크롤러 종료
	 */
	public async closeAll(): Promise<void> {
		const closePromises = Array.from(this.crawlers.values()).map(
			async (crawler) => {
				try {
					await crawler.close();
					return crawler.getSource(); // 성공한 소스 반환
				} catch (error) {
					logger.error(`크롤러 종료 실패: ${crawler.getSource()}`, error);
					return null; // 실패 시 null 반환
				}
			}
		);

		const results = await Promise.all(closePromises);
		const successCount = results.filter(Boolean).length;

		logger.info(`크롤러 종료 완료: ${successCount}/${this.crawlers.size} 성공`);
		this.crawlers.clear();
	}

	/**
	 * 레지스트리 초기화 (모든 등록 정보 삭제)
	 */
	public reset(): void {
		this.closeAll().catch((error) => {
			logger.error("크롤러 종료 중 오류 발생", error);
		});
		this.factories.clear();
		this.crawlers.clear();
		logger.info("크롤러 레지스트리 초기화됨");
	}
}
