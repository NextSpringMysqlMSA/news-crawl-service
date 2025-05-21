import "module-alias/register"; // 경로 별칭 해석을 위해 추가
/**
 * 로컬 독립형 크롤러 테스트 스크립트
 * Docker나 Kafka 없이 크롤러만 독립적으로 테스트
 */
import { NewsSource } from "@/types";
import type { NewsCrawler, NewsItem, SearchResult, CrawlOptions } from "@/types";
// import type { BaseCrawler } from "@/services/base-crawler"; // BaseCrawler는 API 크롤러에 직접 사용 안 함
// 기존 네이버 크롤러 대신 API 기반 크롤러로 변경
import { NaverCrawler } from "@/plugins/crawlers/naver/naver-crawler";
import { GoogleNewsCrawler } from "@/plugins/crawlers/google-news/google-news-crawler";
import fs from "node:fs";
import path from "node:path";
import type { CrawlerFactory } from "@/core/crawler.interface"; // CrawlerFactory는 core에서 가져옴
// CrawlerRegistry는 @/crawlers/crawler-registry 에서 가져옴 (register-plugins.ts 참조) -> @/core/crawler-registry로 변경
import { CrawlerRegistry } from "@/core/crawler-registry"; // 경로 수정
import { registerPlugins } from "@/plugins/register-plugins";

// 인자 파싱 (예: --source naver --keyword "삼성전자" --period "1w")
const args = process.argv.slice(2).reduce((acc, arg, index, arr) => {
	if (arg.startsWith("--")) {
		const key = arg.substring(2);
		const next = arr[index + 1];
		if (next && !next.startsWith("--")) {
			acc[key] = next;
		} else {
			acc[key] = true; // 플래그 인자
		}
	}
	return acc;
}, {} as Record<string, string | boolean>);

const targetSource = args.source as string | undefined;
const targetKeyword = args.keyword as string | undefined;
const targetPeriod = args.period as string | undefined; // period 인자 다시 추가

const TEST_KEYWORDS = targetKeyword ? [targetKeyword] : ["삼정 환경", "삼성전자 Governance", "삼성전자 Social"];
// 테스트할 period. 커맨드라인 인자가 있으면 그것을 사용, 없으면 기본값 "1w" 사용
const TEST_PERIODS = targetPeriod ? [targetPeriod] : ["1w"]; 

const OUTPUT_DIR = path.join(process.cwd(), "test-results");
const TIMEOUT_MS = 60000; // 1분 타임아웃

// 결과 저장 디렉토리 생성
if (!fs.existsSync(OUTPUT_DIR)) {
	fs.mkdirSync(OUTPUT_DIR, { recursive: true });
	console.log(`결과 저장 디렉토리 생성됨: ${OUTPUT_DIR}`);
}

/**
 * 검색 결과를 JSON 파일로 저장
 */
async function saveResults(source: string, keyword: string, period: string | undefined, results: SearchResult): Promise<void> { // period 파라미터 추가
	const periodSuffix = period ? `-${period}` : "-all";
	const filename = `${source}-${keyword.replace(/[^a-zA-Z0-9ㄱ-힣]/g, "_")}${periodSuffix}.json`; // 파일명에 period 포함
	const filePath = path.join(OUTPUT_DIR, filename);
	
	try {
		await fs.promises.writeFile(
			filePath,
			JSON.stringify(results, null, 2),
			"utf-8"
		);
		console.log(`  결과가 저장되었습니다: ${filePath}`);
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`  결과 저장 중 오류: ${errorMessage}`);
	}
}

/**
 * 타임아웃 Promise 생성
 */
function createTimeout(ms: number): Promise<never> {
	return new Promise((_, reject) => {
		setTimeout(() => {
			reject(new Error(`작업이 ${ms}ms 내에 완료되지 않았습니다`));
		}, ms);
	});
}

/**
 * 타임아웃 적용된 검색 실행
 */
async function searchWithTimeout(crawler: NewsCrawler, keyword: string, period?: string): Promise<SearchResult> { // period 파라미터 추가
	const options: CrawlOptions = { maxItems: 100 };
	console.log(`  searchWithTimeout 호출: keyword="${keyword}", period="${period || '전체'}", maxItems=${options.maxItems}`);
	return Promise.race([
		crawler.searchNews(keyword, period, options), // searchNews에 period와 options 전달
		createTimeout(TIMEOUT_MS)
	]);
}

/**
 * 크롤러 테스트 실행
 */
async function runTest() {
	console.log("로컬 독립형 크롤러 테스트 시작...");

	// 크롤러 레지스트리 및 팩토리 설정
	const registry = CrawlerRegistry.getInstance();
	registry.reset();
	
	// 플러그인 등록
	const sourcesToRegister = targetSource ? [targetSource] : Object.values(NewsSource);
	console.log(`등록 대상 소스: ${sourcesToRegister.join(', ')}`);
	await registerPlugins(registry, sourcesToRegister);

	// 사용 가능한 크롤러 인스턴스 목록 생성
	const availableCrawlers: NewsCrawler[] = [];
	for (const source of sourcesToRegister) {
		const crawler = registry.getCrawler(source);
		if (crawler) {
			availableCrawlers.push(crawler);
		} else {
			console.warn(`크롤러를 찾거나 생성할 수 없습니다: ${source}`);
		}
	}

	if (availableCrawlers.length === 0) {
		console.error("테스트할 사용 가능한 크롤러가 없습니다. 소스 이름을 확인하세요.");
		process.exit(1);
	}

	console.log("크롤러 초기화 중...");
	try {
		await Promise.all(availableCrawlers.map(crawler => crawler.initialize()));
		console.log("크롤러 초기화 완료");
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(`크롤러 초기화 실패: ${errorMessage}`);
		process.exit(1);
	}

	try {
		for (const keyword of TEST_KEYWORDS) {
			console.log(`\n키워드 테스트: "${keyword}"`);
			
			for (const periodToTest of TEST_PERIODS) { // period 루프 다시 사용
				console.log(`\n--- 기간: ${periodToTest || '전체'} ---`);
				
				for (const crawler of availableCrawlers) {
					const source = crawler.getSource();

					// 인자로 특정 소스가 지정되었고, 현재 크롤러가 해당 소스가 아니면 건너뛰기
					if (targetSource && source !== targetSource) {
						continue;
					}

					console.log(`\n크롤링 소스: ${source}`);
					
					try {
						console.log(`  검색 시작: ${keyword}, 기간: ${periodToTest || '전체'}, 소스: ${source}`);
						const startTime = Date.now();
						
						const result = await searchWithTimeout(crawler, keyword, periodToTest); // period 전달
						const endTime = Date.now();
						
						console.log(`  검색 완료 (${((endTime - startTime) / 1000).toFixed(2)}초)`);
						console.log(`  검색 결과: ${result.newsItems.length}개의 뉴스 항목 발견 (요청 기간: ${result.period || '결과에 없음'})`);
						
						if (result.newsItems.length > 0) {
							console.log("\n  -- 결과 요약 --");
							result.newsItems.slice(0, 3).forEach((item: NewsItem, index: number) => {
								console.log(`  ${index + 1}. ${item.title} (${item.press || '언론사 정보 없음'}) - ${item.publishedAt}`);
							});
							
							await saveResults(source, keyword, periodToTest, result); // period 전달
						} else {
							console.log("  검색 결과가 없습니다.");
							if(result.error) console.error(`  오류: ${result.error}`);
						}
					} catch (error: unknown) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						console.error(`  크롤링 실패: ${source}, ${keyword}, 기간: ${periodToTest || '전체'} - ${errorMessage}`);
						
						await saveResults(source, keyword, periodToTest, { // period 전달
							keyword,
							period: periodToTest, 
							timestamp: new Date().toISOString(),
							newsItems: [],
							source,
							error: errorMessage
						} as SearchResult);
					}
				}
			} 
		}
	} finally {
		console.log("\n크롤러 종료 중...");
		try {
			await Promise.all(availableCrawlers.map(crawler => crawler.close()));
			console.log("크롤러 종료 완료");
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`크롤러 종료 중 오류: ${errorMessage}`);
		}
	}
	
	console.log(`\n모든 테스트 결과는 ${OUTPUT_DIR} 디렉토리에 저장되었습니다.`);
}

// 테스트 실행
runTest().catch((error: unknown) => {
	const errorMessage = error instanceof Error ? error.message : String(error);
	console.error("테스트 실행 중 오류 발생:", errorMessage);
	process.exit(1);
}); 