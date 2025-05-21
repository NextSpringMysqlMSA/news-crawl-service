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
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36", // User-Agent 업데이트
		),
	CRAWLER_TIMEOUT: z.coerce.number().int().positive().default(30000), // 기본 timeout
	CRAWLER_CONCURRENT_LIMIT: z.coerce.number().int().positive().default(5), // 동시성 제한
	CRAWLER_MAX_ITEMS_PER_KEYWORD: z.coerce.number().int().positive().default(20), // 추가
	CRAWLER_PAGE_LOAD_TIMEOUT_MS: z.coerce.number().int().positive().default(30000), // 추가
	CRAWLER_POST_LOAD_DELAY_MS: z.coerce.number().int().positive().default(2000), // 추가

	// Google 뉴스 RSS 관련 환경 변수
	GOOGLE_NEWS_RSS_URL_FORMAT: z
		.string()
		.default(
			"https://news.google.com/rss/search?q={keyword}&hl=ko&gl=KR&ceid=KR:ko" // +when:{period_value} 제거
		),
	// Naver 뉴스 검색 URL 형식 환경 변수 추가
	NAVER_NEWS_SEARCH_URL_FORMAT: z
		.string()
		.url()
		.default(
			"https://search.naver.com/search.naver?where=news&query={keyword}&sm=tab_opt&sort=0&photo=0&field=0&pd={period}&ds=&de=&docid=&related=0&mynews=0&office_type=0&office_section_code=0&news_office_checked=&nso=so:r,p:{period_value},a:all&start=1"
		),

	// 모니터링 관련 환경 변수
	MONITORING_ENABLED: z.enum(["true", "false"]).default("true"),
	MONITORING_PORT: z.coerce.number().int().positive().default(9464),
	MONITORING_PATH: z.string().default("/metrics"),

	// Naver API Keys 추가
	NAVER_CLIENT_ID: z.string().min(1),
	NAVER_CLIENT_SECRET: z.string().min(1),
});

// 환경 변수 검증
function validateEnv() {
	try {
		// process.env에서 스키마에 정의된 이름으로 환경 변수를 읽어 객체 생성
		const rawEnv = {
			KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID,
			KAFKA_BROKERS: process.env.KAFKA_BROKERS,
			KAFKA_TOPIC: process.env.KAFKA_TOPIC,
			KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID,
			KAFKA_RESULT_TOPIC: process.env.KAFKA_RESULT_TOPIC,
			CRAWLER_HEADLESS: process.env.CRAWLER_HEADLESS,
			CRAWLER_USER_AGENT: process.env.CRAWLER_USER_AGENT,
			CRAWLER_TIMEOUT: process.env.CRAWLER_TIMEOUT,
			CRAWLER_CONCURRENT_LIMIT: process.env.CRAWLER_CONCURRENT_LIMIT,
			CRAWLER_MAX_ITEMS_PER_KEYWORD:
				process.env.CRAWLER_MAX_ITEMS_PER_KEYWORD,
			CRAWLER_PAGE_LOAD_TIMEOUT_MS:
				process.env.CRAWLER_PAGE_LOAD_TIMEOUT_MS,
			CRAWLER_POST_LOAD_DELAY_MS:
				process.env.CRAWLER_POST_LOAD_DELAY_MS,
			GOOGLE_NEWS_RSS_URL_FORMAT:
				process.env.GOOGLE_NEWS_RSS_URL_FORMAT,
			NAVER_NEWS_SEARCH_URL_FORMAT:
				process.env.NAVER_NEWS_SEARCH_URL_FORMAT,
			MONITORING_ENABLED: process.env.MONITORING_ENABLED,
			MONITORING_PORT: process.env.MONITORING_PORT,
			MONITORING_PATH: process.env.MONITORING_PATH,
			// Naver API Keys rawEnv에 추가
			NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID,
			NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET,
		};
		return envSchema.parse(rawEnv);
	} catch (error) {
		if (error instanceof z.ZodError) {
			const errorMessages = error.errors
				.map((err) => {
					// rawEnv에서 값을 가져오므로 path는 스키마의 키 이름 그대로 사용
					return `환경 변수 오류: ${err.path.join(".")} - ${err.message}`;
				})
				.join("\n");

			console.error("환경 변수 검증 실패:");
			console.error(errorMessages);

			// 오류 발생 시 기본값으로라도 진행하지 않고 종료
			process.exit(1);
		} else {
			console.error("환경 변수 로드 중 알 수 없는 오류:", error);
			process.exit(1);
		}
	}
}

// 환경 변수 검증 및 파싱
const validatedEnv = validateEnv();

// 검증된 환경 변수에서 값 추출하여 env 객체 생성
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
		maxItemsPerKeyword: validatedEnv.CRAWLER_MAX_ITEMS_PER_KEYWORD, // 추가
		pageLoadTimeoutMs: validatedEnv.CRAWLER_PAGE_LOAD_TIMEOUT_MS, // 추가
		postLoadDelayMs: validatedEnv.CRAWLER_POST_LOAD_DELAY_MS, // 추가
		googleNewsRssUrlFormat: validatedEnv.GOOGLE_NEWS_RSS_URL_FORMAT,
		naverNewsSearchUrlFormat: validatedEnv.NAVER_NEWS_SEARCH_URL_FORMAT, // 추가
	},
	monitoring: {
		enabled: validatedEnv.MONITORING_ENABLED === "true",
		port: validatedEnv.MONITORING_PORT,
		path: validatedEnv.MONITORING_PATH,
	},
	// Naver API Keys env 객체에 추가
	naver: {
		clientId: validatedEnv.NAVER_CLIENT_ID,
		clientSecret: validatedEnv.NAVER_CLIENT_SECRET,
	},
};

// 환경 변수 로드 결과 로깅 (선택적)
console.log("환경 변수 로드 완료:", {
	kafka_brokers: env.kafka.brokers,
	crawler_headless: env.crawler.headless,
	monitoring_enabled: env.monitoring.enabled,
});
