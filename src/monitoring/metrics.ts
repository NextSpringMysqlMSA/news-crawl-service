import { logger } from "@/utils/logger";
/**
 * 모니터링 지표 모듈
 * Prometheus 클라이언트를 사용하여 애플리케이션 지표를 수집합니다.
 */
import client from "prom-client";

// 기본 레지스트리 생성
const register = new client.Registry();

// 기본 지표 수집 설정
client.collectDefaultMetrics({
	prefix: "news_crawler_",
	register,
	labels: { app: "news-pick" },
});

// 크롤링 요청 카운터
const crawlingRequestCounter = new client.Counter({
	name: "news_crawler_requests_total",
	help: "크롤링 요청 총 횟수",
	labelNames: ["source", "status"] as const,
});

// 크롤링 처리 시간 히스토그램
const crawlingDurationHistogram = new client.Histogram({
	name: "news_crawler_processing_duration_seconds",
	help: "크롤링 처리 시간(초)",
	labelNames: ["source"] as const,
	buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

// 수집한 뉴스 아이템 수 게이지
const newsItemsGauge = new client.Gauge({
	name: "news_crawler_news_items",
	help: "수집한 뉴스 아이템 수",
	labelNames: ["source"] as const,
});

// 활성 크롤링 작업 수 게이지
const activeJobsGauge = new client.Gauge({
	name: "news_crawler_active_jobs",
	help: "현재 실행 중인 크롤링 작업 수",
	labelNames: ["source"] as const,
});

// 메모리 사용량 게이지
const memoryHeapUsedGauge = new client.Gauge({
	name: "news_crawler_memory_heap_used_mb",
	help: "사용 중인 힙 메모리(MB)",
	labelNames: ["source"] as const,
});

// 총 할당된 힙 메모리 게이지
const memoryHeapTotalGauge = new client.Gauge({
	name: "news_crawler_memory_heap_total_mb",
	help: "총 할당된 힙 메모리(MB)",
	labelNames: ["source"] as const,
});

// 메모리 사용률 게이지
const memoryUsageRatioGauge = new client.Gauge({
	name: "news_crawler_memory_usage_ratio",
	help: "메모리 사용률(사용 중인 힙/전체 힙)",
	labelNames: ["source"] as const,
});

// 레지스트리에 지표 등록
register.registerMetric(crawlingRequestCounter);
register.registerMetric(crawlingDurationHistogram);
register.registerMetric(newsItemsGauge);
register.registerMetric(activeJobsGauge);
register.registerMetric(memoryHeapUsedGauge);
register.registerMetric(memoryHeapTotalGauge);
register.registerMetric(memoryUsageRatioGauge);

logger.info("Prometheus 지표 초기화 완료");

/**
 * 크롤링 시작 이벤트 기록
 * @param source - 크롤링 소스 (naver, google-news 등)
 */
export function recordCrawlingStart(source: string): void {
	activeJobsGauge.inc({ source });
	crawlingRequestCounter.inc({ source, status: "started" });
}

/**
 * 크롤링 성공 이벤트 기록
 * @param source - 크롤링 소스
 * @param durationSeconds - 처리 시간(초)
 * @param itemCount - 수집한 뉴스 아이템 수
 */
export function recordCrawlingSuccess(
	source: string,
	durationSeconds: number,
	itemCount: number
): void {
	activeJobsGauge.dec({ source });
	crawlingRequestCounter.inc({ source, status: "success" });
	crawlingDurationHistogram.observe({ source }, durationSeconds);
	newsItemsGauge.set({ source }, itemCount);
}

/**
 * 크롤링 실패 이벤트 기록
 * @param source - 크롤링 소스
 * @param durationSeconds - 처리 시간(초)
 */
export function recordCrawlingFailure(
	source: string,
	durationSeconds: number
): void {
	activeJobsGauge.dec({ source });
	crawlingRequestCounter.inc({ source, status: "failure" });
	crawlingDurationHistogram.observe({ source }, durationSeconds);
}

/**
 * 메모리 사용량 기록
 * @param source - 크롤링 소스
 * @param heapUsedMB - 사용 중인 힙 메모리(MB)
 * @param heapTotalMB - 총 할당된 힙 메모리(MB)
 */
export function recordMemoryUsage(
	source: string,
	heapUsedMB: number,
	heapTotalMB: number
): void {
	memoryHeapUsedGauge.set({ source }, heapUsedMB);
	memoryHeapTotalGauge.set({ source }, heapTotalMB);

	// 안전을 위해 0으로 나누기 방지
	if (heapTotalMB > 0) {
		const ratio = heapUsedMB / heapTotalMB;
		memoryUsageRatioGauge.set({ source }, ratio);
	}
}

/**
 * 지표 레지스트리 가져오기
 * @returns Prometheus 레지스트리
 */
export function getMetricsRegistry(): client.Registry {
	return register;
}

/**
 * 현재 지표를 문자열로 가져오기
 * @returns 현재 지표 문자열
 */
export async function getMetricsAsString(): Promise<string> {
	return await register.metrics();
}
