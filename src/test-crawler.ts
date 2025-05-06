/**
 * 크롤러 테스트 스크립트
 * 크롤러 매니저를 사용하여 다양한 뉴스 소스를 테스트
 */
import { NewsCrawlerManager } from "@/services/crawler-manager";
import { NewsSource } from "@/types";

const TEST_KEYWORDS = ["삼정", "삼성전자"];
const TEST_PERIODS = ["1w", "1m", "all"];

async function runTest() {
	console.log("크롤러 매니저 테스트 시작...");

	const crawlerManager = new NewsCrawlerManager();
	await crawlerManager.initialize();

	try {
		const availableSources = crawlerManager.getAvailableSources();
		console.log(`사용 가능한 뉴스 소스: ${availableSources.join(", ")}`);

		// 각 키워드별 테스트
		for (const keyword of TEST_KEYWORDS) {
			console.log(`\n테스트 키워드: ${keyword}`);

			// 각 기간별 테스트
			for (const period of TEST_PERIODS) {
				console.log(`\n  기간: ${period}`);

				// 각 소스별 테스트
				for (const source of availableSources) {
					console.log(`\n    소스: ${source}`);

					try {
						const result = await crawlerManager.searchNewsBySource(
							source,
							keyword,
							period,
							{ maxItems: 3 },
						);
						console.log(`    ${result.newsItems.length}개의 뉴스 항목 발견`);

						// 첫 번째 뉴스 아이템 출력
						if (result.newsItems.length > 0) {
							console.log("    첫 번째 뉴스 항목:");
							console.log(`      제목: ${result.newsItems[0].title}`);
							console.log(`      언론사: ${result.newsItems[0].press}`);
							console.log(`      URL: ${result.newsItems[0].url}`);
							console.log(`      발행시간: ${result.newsItems[0].publishedAt}`);
							if (result.newsItems[0].summary) {
								console.log(`      요약: ${result.newsItems[0].summary}`);
							}
						}
					} catch (error) {
						console.error(
							`    소스 ${source}, 키워드 ${keyword}, 기간 ${period} 크롤링 중 오류:`,
							error,
						);
					}
				}

				// 병렬 검색 테스트 (모든 소스)
				console.log("\n  모든 소스에서 병렬 검색:");
				try {
					const results = await crawlerManager.searchNews(
						keyword,
						period,
						availableSources,
						{ maxItems: 3 },
					);
					console.log(
						`  ${results.length}개 소스에서 총 ${results.reduce((total, r) => total + r.newsItems.length, 0)}개의 뉴스 항목 발견`,
					);

					// 각 소스별 결과 요약
					for (const result of results) {
						console.log(
							`    ${result.source}: ${result.newsItems.length}개 항목`,
						);
					}
				} catch (error) {
					console.error("  병렬 검색 중 오류:", error);
				}
			}
		}

		// 크롤링 요청 처리 테스트
		console.log("\n크롤링 요청 처리 테스트:");
		try {
			const request = {
				keyword: TEST_KEYWORDS[0],
				periods: [TEST_PERIODS[0]],
				sources: [NewsSource.NAVER],
			};

			const results = await crawlerManager.processCrawlRequest(request);
			console.log(`요청 처리 결과: ${results.length}개의 결과 세트`);
			console.log(
				`총 뉴스 항목: ${results.reduce((total, r) => total + r.newsItems.length, 0)}개`,
			);
		} catch (error) {
			console.error("크롤링 요청 처리 중 오류:", error);
		}
	} finally {
		await crawlerManager.close();
	}

	console.log("\n크롤러 테스트 완료");
}

// 테스트 실행
runTest().catch((error) => {
	console.error("테스트 실패:", error);
	process.exit(1);
});
