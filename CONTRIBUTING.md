# 기여 가이드라인

News-Crawl-Service 프로젝트에 기여하고 싶으신가요? 이 문서는 코드 작성, 커밋, 브랜치 관리, 풀 리퀘스트 제출 등에 관한 가이드라인을 제공합니다.

## 목차

- [개발 환경 설정](#개발-환경-설정)
- [코드 스타일](#코드-스타일)
- [브랜치 전략](#브랜치-전략)
- [커밋 메시지 컨벤션](#커밋-메시지-컨벤션)
- [풀 리퀘스트 절차](#풀-리퀘스트-절차)
- [새로운 크롤러 개발 가이드](#새로운-크롤러-개발-가이드)
- [테스트 작성 가이드](#테스트-작성-가이드)
- [문서화 지침](#문서화-지침)

## 개발 환경 설정

### 요구사항

- Node.js 18 이상
- pnpm 10.x 이상
- Git
- Docker 및 Docker Compose (로컬 테스트용)

### 설치 방법

1. 저장소를 복제합니다.
   ```bash
   git clone https://github.com/your-username/news-crawl-service.git
   cd news-crawl-service
   ```

2. 의존성을 설치합니다.
   ```bash
   pnpm install
   ```

3. 환경 변수를 설정합니다.
   ```bash
   cp env.example.txt .env
   ```

   `.env` 파일을 열고 필요한 설정을 입력합니다.

4. 개발 서버를 실행합니다.
   ```bash
   pnpm dev
   ```

## 코드 스타일

이 프로젝트는 Biome를 사용하여 코드 스타일을 관리합니다. 코드 작성 시 다음 규칙을 준수해 주세요:

### 일반 규칙

- **타입스크립트 사용**: `any` 타입 사용을 지양하고 구체적인 타입을 정의하세요.
- **파일 명명**: 파스칼 케이스(PascalCase)는 클래스용, 케밥 케이스(kebab-case)는 일반 모듈용으로 사용합니다.
- **들여쓰기**: 탭 또는 공백 2칸 (biome.json 설정 준수)

### 변수 및 함수 명명 규칙

- **변수**: camelCase 사용
- **상수**: UPPER_SNAKE_CASE 사용
- **클래스**: PascalCase 사용
- **인터페이스**: PascalCase 사용 (`Interface` 접미사 없이)
- **타입**: PascalCase 사용

### 코드 구조

- **한 파일에 한 가지 책임**: 각 파일은 단일 책임 원칙을 따라야 합니다.
- **imports 정렬**: Node.js 내장 모듈, 외부 라이브러리, 내부 모듈, 상대 경로 모듈 순으로 정렬합니다.
- **클래스 구조**: 필드 선언, 생성자, 공개 메서드, 비공개/보호 메서드 순으로 작성합니다.

### 린팅 및 포맷팅

코드를 제출하기 전에 Biome를 실행하여 포맷팅 및 린트 오류를 확인하세요:

```bash
# 코드 포맷팅 검사
pnpm biome check .

# 코드 자동 포맷팅
pnpm biome format --write .
```

## 브랜치 전략

이 프로젝트는 GitFlow 기반의 브랜치 전략을 사용합니다:

- **main**: 프로덕션 릴리스용 브랜치
- **develop**: 개발 통합 브랜치
- **feature/***: 새 기능 개발 브랜치 (예: `feature/google-news-crawler`)
- **fix/***: 버그 수정 브랜치 (예: `fix/kafka-connection-error`)
- **refactor/***: 코드 개선 브랜치 (예: `refactor/crawler-registry`)
- **docs/***: 문서 업데이트 브랜치 (예: `docs/api-documentation`)

새로운 기능 개발 시:

1. `develop` 브랜치에서 새 브랜치를 생성합니다.
   ```bash
   git checkout develop
   git pull
   git checkout -b feature/my-new-feature
   ```

2. 기능 개발 후 `develop` 브랜치로 풀 리퀘스트를 생성합니다.

## 커밋 메시지 컨벤션

이 프로젝트는 [Conventional Commits](https://www.conventionalcommits.org/) 규칙을 따릅니다:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### 커밋 타입

- **feat**: 새로운 기능 추가
- **fix**: 버그 수정
- **docs**: 문서 변경
- **style**: 코드 스타일 변경 (기능 변경 없음)
- **refactor**: 기능 변경 없는 코드 리팩토링
- **perf**: 성능 향상
- **test**: 테스트 추가/수정
- **chore**: 빌드 프로세스나 도구 변경

### 예시

```
feat(crawler): 구글 뉴스 RSS 크롤러 추가

구글 뉴스에서 RSS 피드를 통해 뉴스를 수집하는 새로운 크롤러를 구현합니다.
- XML 파싱 로직 추가
- 검색 결과를 NewsItem 형식으로 변환
- 크롤러 레지스트리에 등록

Close #42
```

## 풀 리퀘스트 절차

1. 자신의 포크 또는 브랜치에서 작업합니다.
2. 코드 작성이 완료되면 `develop` 브랜치로 풀 리퀘스트를 생성합니다.
3. PR 템플릿을 작성합니다. 다음 내용을 포함해야 합니다:
   - 변경 사항 요약
   - 관련 이슈 번호
   - 테스트 방법
   - 스크린샷 (UI 변경이 있는 경우)
4. 리뷰어에게 코드 리뷰를 요청합니다.
5. 리뷰어의 피드백을 반영합니다.
6. 최종 승인 후 PR이 병합됩니다.

## 새로운 크롤러 개발 가이드

새로운 뉴스 소스 크롤러를 개발하려면 다음 단계를 따르세요:

### 1. 디렉토리 구조 생성

```
src/plugins/crawlers/{소스명}/
├── {소스명}-crawler.ts       # 크롤러 구현체
├── {소스명}-crawler-factory.ts   # 크롤러 팩토리
└── index.ts                 # 내보내기 파일
```

### 2. 크롤러 클래스 구현

```typescript
// src/plugins/crawlers/example/example-crawler.ts
import { BaseCrawler } from "@/core/base-crawler";
import { SearchResult } from "@/types";

export class ExampleCrawler extends BaseCrawler {
  constructor() {
    super();
  }
  
  getSource(): string {
    return "example";
  }
  
  async searchNews(keyword: string, period?: string): Promise<SearchResult> {
    try {
      // 크롤링 로직 구현
      const newsItems = await this.fetchAndParseNews(keyword, period);
      
      return {
        keyword,
        newsItems,
        source: this.getSource(),
        timestamp: new Date().toISOString(),
        period,
      };
    } catch (error) {
      this.handleError(error, keyword, period);
    }
  }
  
  // 기타 필요한 메서드 구현
}
```

### 3. 팩토리 클래스 구현

```typescript
// src/plugins/crawlers/example/example-crawler-factory.ts
import { CrawlerFactory } from "@/core/crawler.interface";
import { ExampleCrawler } from "./example-crawler";

export class ExampleCrawlerFactory implements CrawlerFactory {
  create(): ExampleCrawler {
    return new ExampleCrawler();
  }
  
  getSource(): string {
    return "example";
  }
}
```

### 4. 내보내기 파일 작성

```typescript
// src/plugins/crawlers/example/index.ts
export * from "./example-crawler";
export * from "./example-crawler-factory";
```

### 5. 크롤러 등록

```typescript
// src/plugins/register-plugins.ts에 추가
import { CrawlerRegistry } from "@/core/crawler-registry";
import { ExampleCrawlerFactory } from "./crawlers/example";

export function registerPlugins(registry: CrawlerRegistry): void {
  // 기존 등록 코드...
  registry.register(new ExampleCrawlerFactory());
}
```

## 테스트 작성 가이드

각 크롤러 및 주요 기능에 대한 테스트를 작성해주세요. 테스트는 다음 패턴을 따라야 합니다:

```typescript
// __tests__/crawler/example-crawler.test.ts
describe('ExampleCrawler', () => {
  let crawler: ExampleCrawler;
  
  beforeEach(() => {
    crawler = new ExampleCrawler();
  });
  
  it('should return the correct source', () => {
    expect(crawler.getSource()).toBe('example');
  });
  
  it('should fetch news successfully', async () => {
    // 테스트 구현...
  });
  
  // 추가 테스트...
});
```

## 문서화 지침

1. **JSDoc 주석**: 모든 함수, 클래스, 인터페이스에 JSDoc 형식의 주석을 작성해주세요.

   ```typescript
   /**
    * 뉴스 검색 결과를 파싱하여 표준 형식으로 변환합니다.
    * @param apiResponse - API로부터 받은 원본 응답
    * @returns 정규화된 뉴스 아이템 배열
    * @throws {CrawlerError} 파싱 실패 시 발생
    */
   parseApiResponse(apiResponse: any): NewsItem[] {
     // 구현...
   }
   ```

2. **README 업데이트**: 주요 기능 추가 시 README.md 파일을 업데이트해주세요.

3. **변경 로그**: 버전 변경 시 CHANGELOG.md 파일을 업데이트해주세요.

---

이 가이드라인에 따라 프로젝트에 기여해 주셔서 감사합니다. 질문이 있으시면 이슈를 통해 문의해 주세요. 