/**
 * 애플리케이션 설정 파일
 * Kafka 및 크롤링 관련 설정 정보를 담고 있음
 * .env 파일에서 환경 변수를 로드
 */
import { env } from "./env";

export const config = {
	kafka: {
		clientId: env.kafka.clientId,
		brokers: env.kafka.brokers,
		topic: env.kafka.topic,
		groupId: env.kafka.groupId,
		resultTopic: env.kafka.resultTopic,
	},
	crawler: {
		headless: env.crawler.headless,
		userAgent: env.crawler.userAgent,
		timeout: env.crawler.timeout,
		concurrentLimit: env.crawler.concurrentLimit,
		maxItemsPerKeyword: env.crawler.maxItemsPerKeyword,
		pageLoadTimeoutMs: env.crawler.pageLoadTimeoutMs,
		postLoadDelayMs: env.crawler.postLoadDelayMs,
		googleNewsRssUrlFormat: env.crawler.googleNewsRssUrlFormat,
		naverNewsSearchUrlFormat: env.crawler.naverNewsSearchUrlFormat,
	},
	monitoring: {
		enabled: env.monitoring.enabled,
		port: env.monitoring.port,
		path: env.monitoring.path,
	},
};
