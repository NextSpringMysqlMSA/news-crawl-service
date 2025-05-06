import path from "node:path";
import { logger } from "@/utils/logger";
/**
 * 환경 변수 관리 모듈
 * dotenv를 사용하여 .env 파일의 환경 변수를 로드
 * zod를 사용하여 환경 변수 유효성 검증
 */
import dotenv from "dotenv";
import { z } from "zod";

// .env 파일 로드
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// 환경 변수 스키마 정의
const envSchema = z.object({
	// Kafka 관련 환경 변수
	KAFKA_CLIENT_ID: z.string().default("news-crawler"),
	KAFKA_BROKERS: z.string().default("localhost:9092"),
	KAFKA_TOPIC: z.string().default("news-keywords"),
	KAFKA_GROUP_ID: z.string().default("news-crawler-group"),
	KAFKA_RESULT_TOPIC: z.string().default("news-results"),

	// 크롤러 관련 환경 변수
	CRAWLER_HEADLESS: z.enum(["true", "false"]).default("true"),
	CRAWLER_USER_AGENT: z
		.string()
		.default(
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		),
	CRAWLER_TIMEOUT: z
		.string()
		.transform((val) => Number.parseInt(val, 10))
		.default("30000"),
	CRAWLER_CONCURRENT_LIMIT: z
		.string()
		.transform((val) => Number.parseInt(val, 10))
		.default("5"),

	// 네이버 뉴스 관련 환경 변수
	NAVER_NEWS_SEARCH_URL_FORMAT: z
		.string()
		.default(
			"https://search.naver.com/search.naver?ssc=tab.news.all&query={keyword}&sm=tab_opt&sort=1&photo=0&field=0&pd={period}&ds=&de=&docid=&related=0&mynews=0&office_type=0&office_section_code=0&news_office_checked=&nso=so%3Add%2Cp%3A{period_value}&is_sug_officeid=0&office_category=&service_area=",
		),

	// 구글 뉴스 관련 환경 변수
	GOOGLE_NEWS_RSS_URL_FORMAT: z
		.string()
		.default(
			"https://news.google.com/rss/search?hl=ko&gl=KR&ceid=KR:ko&q={keyword}",
		),

	// 모니터링 관련 환경 변수
	MONITORING_ENABLED: z.enum(["true", "false"]).default("true"),
	MONITORING_PORT: z
		.string()
		.transform((val) => Number.parseInt(val, 10))
		.default("9464"),
	MONITORING_PATH: z.string().default("/metrics"),
});

// 환경 변수 검증
function validateEnv() {
	try {
		return envSchema.parse(process.env);
	} catch (error) {
		if (error instanceof z.ZodError) {
			const errorMessages = error.errors
				.map((err) => {
					return `환경 변수 오류: ${err.path.join(".")} - ${err.message}`;
				})
				.join("\n");

			console.error("환경 변수 검증 실패:");
			console.error(errorMessages);

			throw new Error(`환경 변수 검증 실패: ${errorMessages}`);
		}

		throw error;
	}
}

// 환경 변수 검증 및 파싱
const validatedEnv = validateEnv();

// 검증된 환경 변수에서 값 추출
export const env = {
	kafka: {
		clientId: validatedEnv.KAFKA_CLIENT_ID,
		brokers: validatedEnv.KAFKA_BROKERS.split(","),
		topic: validatedEnv.KAFKA_TOPIC,
		groupId: validatedEnv.KAFKA_GROUP_ID,
		resultTopic: validatedEnv.KAFKA_RESULT_TOPIC,
	},
	crawler: {
		headless: validatedEnv.CRAWLER_HEADLESS === "true",
		userAgent: validatedEnv.CRAWLER_USER_AGENT,
		timeout: validatedEnv.CRAWLER_TIMEOUT,
		concurrentLimit: validatedEnv.CRAWLER_CONCURRENT_LIMIT,
		naverNewsSearchUrlFormat: validatedEnv.NAVER_NEWS_SEARCH_URL_FORMAT,
		googleNewsRssUrlFormat: validatedEnv.GOOGLE_NEWS_RSS_URL_FORMAT,
	},
	monitoring: {
		enabled: validatedEnv.MONITORING_ENABLED === "true",
		port: validatedEnv.MONITORING_PORT,
		path: validatedEnv.MONITORING_PATH,
	},
};

// 환경 변수 로드 결과 로깅
logger?.info("환경 변수 로드 및 검증 완료", {
	kafka: {
		clientId: env.kafka.clientId,
		brokers: env.kafka.brokers,
		topic: env.kafka.topic,
		resultTopic: env.kafka.resultTopic,
	},
	crawler: {
		concurrentLimit: env.crawler.concurrentLimit,
	},
	monitoring: {
		enabled: env.monitoring.enabled,
		port: env.monitoring.port,
	},
});
