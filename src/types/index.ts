/**
 * 애플리케이션에서 사용되는 타입 정의
 */

// 뉴스 기사 타입 정의
export interface NewsItem {
	title: string; // 뉴스 제목
	url: string; // 뉴스 URL (네이버 뉴스 링크 또는 원문 링크)
	originalUrl?: string; // 뉴스 기사 원문 URL (네이버 API의 originallink)
	press?: string; // 언론사 (API에서 직접 제공하지 않으므로 비워둘 수 있음)
	publishedAt: string; // 발행 시간 (ISO 8601 형식 권장)
	description?: string; // 뉴스 기사 요약 (네이버 API의 description)
}

// 키워드 검색 결과 타입
export interface SearchResult {
	keyword: string; // 검색 키워드
	period?: string; // 검색 기간 (1w, 1m, all 등, 선택적)
	timestamp: string; // 검색 시간
	newsItems: NewsItem[]; // 검색된 뉴스 아이템 목록
	source: string; // 뉴스 소스 (naver, google-news 등)
	error?: string; // 오류 발생 시 메시지 (선택적)
}

// 크롤링 요청 타입
export interface CrawlRequest {
	keyword: string; // 검색할 키워드
	periods: string[]; // 검색 기간 목록 (1w, 1m, all 등)
	sources?: string[]; // 크롤링할 뉴스 소스 (미지정 시 모든 소스)
}

/**
 * 크롤링 오류 유형 열거형
 * 
 * 오류의 특성에 따라 다른 처리 전략을 적용할 수 있도록 구분합니다.
 */
export enum ErrorType {
	NETWORK = "network", // 네트워크 연결 문제
	TIMEOUT = "timeout", // 요청 시간 초과
	SELECTOR = "selector", // 선택자 관련 오류 (웹 스크래핑)
	PARSING = "parsing", // 데이터 파싱 오류 (API 응답, RSS 피드)
	BROWSER = "browser", // 브라우저 관련 오류 (Puppeteer)
	UNKNOWN = "unknown", // 알 수 없는 오류
}

/**
 * 크롤링 오류 클래스
 * 
 * 크롤링 중 발생하는 오류를 표준화된 방식으로 처리합니다.
 * 오류가 발생한 소스, 키워드, 오류 유형 등의 컨텍스트 정보를 포함합니다.
 */
export class CrawlerError extends Error {
	public source?: string;    // 오류가 발생한 크롤러 소스
	public keyword?: string;   // 검색 키워드
	public errorType?: ErrorType; // 오류 유형

	constructor(
		message: string,
		source?: string,
		keyword?: string,
		errorType?: ErrorType
	) {
		super(message);
		this.name = "CrawlerError";
		this.source = source;
		this.keyword = keyword;
		this.errorType = errorType;

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, CrawlerError);
		}
	}
}

/**
 * Dead Letter Queue 메시지 인터페이스
 * 
 * 처리에 실패한 메시지를 DLQ로 전송할 때 사용되는 표준화된 형식입니다.
 * 메시지는 원본 요청 정보, 오류 정보, 처리 시도 정보를 포함합니다.
 */
export interface DeadLetterQueueMessage {
	// 메시지 메타데이터
	id: string;             // 메시지 고유 ID
	timestamp: string;      // 메시지 생성 시간 (ISO 8601)
	
	// 원본 요청 정보
	originalRequest: CrawlRequest; // 원본 크롤링 요청
	
	// 오류 정보
	errorType: ErrorType;   // 오류 유형
	errorMessage: string;   // 오류 메시지
	stackTrace?: string;    // 스택 트레이스 (가능한 경우)
	
	// 처리 시도 정보
	retryCount: number;     // 시도한 재시도 횟수
	maxRetries: number;     // 최대 재시도 횟수
	source?: string;        // 오류가 발생한 크롤러 소스
	
	// 처리 상태
	status: 'failed' | 'reprocessed' | 'ignored'; // 처리 상태
	reprocessedAt?: string; // 재처리된 시간 (해당되는 경우)
}

// 크롤링 옵션 타입
export interface CrawlOptions {
	maxItems?: number; // 최대 크롤링 아이템 수 (기본값: 20)
	debug?: boolean;   // 디버그 모드 활성화 여부
}

// 기간 매핑 타입
export type PeriodMap = Record<string, { pd: string; value: string }>;

// 뉴스 소스 타입 (네이버, 구글 뉴스 등)
export enum NewsSource {
	NAVER = "naver",
	GOOGLE_NEWS = "google-news",
}

// 크롤러 인터페이스
export interface NewsCrawler {
	// 크롤러 초기화
	initialize(): Promise<void>;

	// 크롤러 종료
	close(): Promise<void>;

	// 뉴스 검색
	searchNews(
		keyword: string,
		period?: string, // 검색 기간 (선택적)
		options?: CrawlOptions
	): Promise<SearchResult>;

	// 소스 이름 반환
	getSource(): string;
}

// Naver News API 관련 타입
export interface NaverNewsApiItem {
	title: string; // 뉴스 기사의 제목
	originallink: string; // 뉴스 기사 원문의 URL
	link: string; // 뉴스 기사의 네이버 뉴스 URL
	description: string; // 뉴스 기사의 내용을 요약한 패시지 정보
	pubDate: string; // 뉴스 기사가 네이버에 제공된 시간 (RFC 1123 GMT)
}

export interface NaverNewsApiResponse {
	lastBuildDate: string; // 검색 결과를 생성한 시간
	total: number; // 총 검색 결과 개수
	start: number; // 검색 시작 위치
	display: number; // 한 번에 표시할 검색 결과 개수
	items: NaverNewsApiItem[]; // 개별 검색 결과
}
