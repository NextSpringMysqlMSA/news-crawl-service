import type { NewsItem } from "@/types";
/**
 * 네이버 뉴스 HTML 파싱 유틸리티 함수들
 * 네이버 뉴스 HTML을 파싱하여 필요한 정보를 추출
 */
import type { Page } from "puppeteer";

/**
 * 네이버 뉴스 리스트에서 뉴스 항목 추출
 */
export async function extractNewsItemsFromNaverList(
	page: Page,
	maxItems: number,
): Promise<NewsItem[]> {
	return page.evaluate((maxItems) => {
		const newsItems: NewsItem[] = [];

		// 뉴스 아이템 컨테이너 선택
		const newsElements = document.querySelectorAll(".list_news .bx");

		for (let i = 0; i < Math.min(newsElements.length, maxItems); i++) {
			const element = newsElements[i];
			const titleElement = element.querySelector(".news_tit");
			const pressElement = element.querySelector(".info_group .press");
			const timeElement = element.querySelector(".info_group .info");

			if (!titleElement || !pressElement) continue;

			const title = titleElement.textContent?.trim() || "";
			const url = titleElement.getAttribute("href") || "";
			const press = pressElement.textContent?.trim() || "";

			// 발행 시간 추출, 없으면 현재 시간 사용
			let publishedAt = "";
			if (timeElement) {
				publishedAt = timeElement.textContent?.trim() || "";
			} else {
				publishedAt = new Date().toISOString();
			}

			// 요약 추출 (있는 경우)
			const summaryElement = element.querySelector(".dsc_txt");
			const summary = summaryElement
				? summaryElement.textContent?.trim()
				: undefined;

			newsItems.push({
				title,
				url,
				press,
				publishedAt,
				summary,
			});
		}

		return newsItems;
	}, maxItems);
}

/**
 * 네이버 뉴스 상세 페이지 형식의 HTML에서 뉴스 항목 추출
 */
export async function extractNewsItemsFromNaverDetailFormat(
	page: Page,
	maxItems: number,
): Promise<NewsItem[]> {
	return page.evaluate((maxItems) => {
		const newsItems: NewsItem[] = [];

		// 뉴스 아이템 컨테이너 선택 - 사용자가 제공한 포맷
		const newsElements = document.querySelectorAll(
			".sds-comps-vertical-layout.EPe0s1rCZZ86kDLT_SY2",
		);

		for (let i = 0; i < Math.min(newsElements.length, maxItems); i++) {
			const element = newsElements[i];
			const titleElement = element.querySelector(
				".sds-comps-text-type-headline1",
			);
			const pressElement = element.querySelector(
				".sds-comps-profile-info-title-text",
			);
			const timeElement = element.querySelector(
				".sds-comps-profile-info-subtext",
			);
			const summaryElement = element.querySelector(
				".sds-comps-text-ellipsis-3.sds-comps-text-type-body1",
			);

			// URL 추출
			let url = "";
			const linkElement = element.querySelector(
				"a.lu8Lfh20c9DvvP05mqBf.tym_MoKIfC84Aqvg9SKg",
			);
			if (linkElement) {
				url = linkElement.getAttribute("href") || "";
			}

			if (!titleElement || !pressElement) continue;

			const title = titleElement.textContent?.trim() || "";
			const press = pressElement.textContent?.trim() || "";

			// 발행 시간 추출
			let publishedAt = "";
			if (timeElement) {
				publishedAt = timeElement.textContent?.trim() || "";
			} else {
				publishedAt = new Date().toISOString();
			}

			// 요약 추출
			const summary = summaryElement
				? summaryElement.textContent?.trim()
				: undefined;

			newsItems.push({
				title,
				url,
				press,
				publishedAt,
				summary,
			});
		}

		return newsItems;
	}, maxItems);
}
