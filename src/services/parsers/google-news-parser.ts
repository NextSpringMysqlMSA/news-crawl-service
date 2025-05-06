import type { NewsItem } from "@/types";
/**
 * 구글 뉴스 RSS 파싱 유틸리티 함수들
 * 구글 뉴스 RSS XML을 파싱하여 필요한 정보를 추출
 */
import { parseStringPromise } from "xml2js";

/**
 * 구글 뉴스 RSS에서 뉴스 항목 추출
 */
export async function extractNewsItemsFromGoogleNewsRSS(
	xmlData: string,
	maxItems: number,
): Promise<NewsItem[]> {
	try {
		const result = await parseStringPromise(xmlData, {
			explicitArray: false,
			trim: true,
		});

		if (!result?.rss?.channel?.item) {
			return [];
		}

		// items가 배열이 아니면 배열로 변환
		const items = Array.isArray(result.rss.channel.item)
			? result.rss.channel.item
			: [result.rss.channel.item];

		// 최대 항목 수만큼 추출
		const newsItems: NewsItem[] = [];
		const count = Math.min(items.length, maxItems);

		for (let i = 0; i < count; i++) {
			const item = items[i];

			if (!item.title || !item.link) continue;

			// RSS description에서 뉴스 출처 정보 추출
			let press = "";
			let summary = "";

			if (item.source?._) {
				press = item.source._;
			} else if (item.source) {
				press = item.source;
			}

			// description에서 요약 정보 추출 시도
			if (item.description) {
				// description 내의 HTML 태그 제거
				const regex = /<font color="#6f6f6f">([^<]+)<\/font>/;
				const match = regex.exec(item.description);

				if (match?.[1]) {
					press = match[1];
				}

				// HTML 태그 제거
				summary = item.description.replace(/<[^>]*>/g, "");
			}

			// 발행 시간 추출
			const publishedAt = item.pubDate || new Date().toISOString();

			newsItems.push({
				title: item.title,
				url: item.link,
				press,
				publishedAt,
				summary,
			});
		}

		return newsItems;
	} catch (error) {
		console.error("구글 뉴스 RSS 파싱 중 오류:", error);
		return [];
	}
}
