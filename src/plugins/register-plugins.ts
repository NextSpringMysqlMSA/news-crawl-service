import type { CrawlerRegistry } from "@/core/crawler-registry";
import type { CrawlerFactory } from "@/core/crawler.interface";
/**
 * 플러그인 등록 모듈
 * 모든 크롤러 팩토리를 자동으로 등록합니다.
 */
import { logger } from "@/utils/logger";
import { NewsSource } from "@/types";

/**
 * 모든 크롤러 플러그인 등록
 * @param registry - 크롤러 레지스트리 인스턴스
 * @returns 등록된 플러그인 수
 */
export function registerAllPlugins(registry: CrawlerRegistry): number {
	logger.info("크롤러 플러그인 등록 시작");

	const factories: CrawlerFactory[] = [];

	let registered = 0;

	for (const factory of factories) {
		try {
			const source = registry.registerFactory(factory);
			logger.debug(`크롤러 플러그인 등록됨: ${source}`);
			registered++;
		} catch (error) {
			logger.error(`크롤러 플러그인 등록 실패: ${factory.getSource()}`, error);
		}
	}

	logger.info(`총 ${registered}개의 크롤러 플러그인 등록 완료`);
	return registered;
}

/**
 * 특정 크롤러 플러그인 등록
 * @param registry - 크롤러 레지스트리 인스턴스
 * @param sources - 등록할 소스 이름 배열
 * @returns 등록된 플러그인 수
 */
export async function registerPlugins(
	registry: CrawlerRegistry,
	sources: string[]
): Promise<number> {
	logger.info(`지정된 크롤러 플러그인 등록 시작: ${sources.join(", ")}`);

	// 각 소스에 대한 팩토리 생성 함수 맵
	const factoryMap: Record<string, () => Promise<CrawlerFactory>> = {
		[NewsSource.NAVER]: async () => {
			const { NaverCrawlerFactory } = await import(
				"./crawlers/naver/naver-crawler-factory"
			);
			return new NaverCrawlerFactory();
		},
		[NewsSource.GOOGLE_NEWS]: async () => {
			const { GoogleNewsCrawlerFactory } = await import(
				"./crawlers/google-news/google-news-crawler-factory"
			);
			return new GoogleNewsCrawlerFactory();
		},
		// 여기에 다른 크롤러 팩토리 추가 가능
	};

	let registered = 0;

	// Promise.all을 사용하여 모든 팩토리 로딩을 병렬로 처리
	const registrationPromises = sources.map(async (source) => {
		const factoryCreator = factoryMap[source];

		if (!factoryCreator) {
			logger.warn(`알 수 없는 크롤러 소스: ${source}`);
			return;
		}

		try {
			const factory = await factoryCreator(); // 비동기 함수 호출
			registry.registerFactory(factory);
			logger.debug(`크롤러 플러그인 등록됨: ${source}`);
			registered++;
		} catch (error) {
			logger.error(`크롤러 플러그인 등록 실패: ${source}`, error);
		}
	});

	// 모든 등록 작업이 완료될 때까지 기다림
	await Promise.all(registrationPromises);

	logger.info(
		`총 ${registered}개의 크롤러 플러그인 비동기 등록 완료`
	);

	return registered;
}
