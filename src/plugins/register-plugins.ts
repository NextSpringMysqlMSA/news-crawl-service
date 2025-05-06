import type { CrawlerRegistry } from "@/crawlers/crawler-registry";
import { NaverCrawlerFactory } from "@/crawlers/naver";
/**
 * 플러그인 등록 모듈
 * 모든 크롤러 팩토리를 자동으로 등록합니다.
 */
import { logger } from "@/utils/logger";

/**
 * 모든 크롤러 플러그인 등록
 * @param registry - 크롤러 레지스트리 인스턴스
 * @returns 등록된 플러그인 수
 */
export function registerAllPlugins(registry: CrawlerRegistry): number {
	logger.info("크롤러 플러그인 등록 시작");

	const factories = [new NaverCrawlerFactory()];

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
export function registerPlugins(
	registry: CrawlerRegistry,
	sources: string[],
): number {
	logger.info(`지정된 크롤러 플러그인 등록 시작: ${sources.join(", ")}`);

	const factoryMap = {
		naver: () => new NaverCrawlerFactory(),
	};

	let registered = 0;

	for (const source of sources) {
		const factoryCreator = factoryMap[source as keyof typeof factoryMap];

		if (!factoryCreator) {
			logger.warn(`알 수 없는 크롤러 소스: ${source}`);
			continue;
		}

		try {
			const factory = factoryCreator();
			registry.registerFactory(factory);
			logger.debug(`크롤러 플러그인 등록됨: ${source}`);
			registered++;
		} catch (error) {
			logger.error(`크롤러 플러그인 등록 실패: ${source}`, error);
		}
	}

	logger.info(`총 ${registered}개의 크롤러 플러그인 등록 완료`);
	return registered;
}
