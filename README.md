# News-Pick

네이버 뉴스 크롤링 서비스입니다. Kafka 토픽을 구독하여 키워드가 들어올 때마다 네이버 뉴스를 크롤링합니다.

## 기술 스택

- Node.js
- TypeScript
- Puppeteer (웹 크롤링)
- KafkaJS (Kafka 클라이언트)
- pnpm (패키지 관리)
- dotenv (환경 변수 관리)

## 특징

- 네이버 뉴스 검색 결과 크롤링
- 다양한 HTML 형식 지원 (일반 리스트, 상세 페이지 형식)
- Kafka 토픽을 통한 비동기 크롤링 요청 처리
- 환경 변수를 통한 설정 관리

## 설치

```bash
# 패키지 설치
pnpm install

# 환경 변수 파일 생성
pnpm create-env
```

## 실행

### 개발 모드

```bash
# 개발 모드로 실행
pnpm dev
```

### 크롤러 테스트

```bash
# 크롤러 테스트 실행
pnpm test-crawler
```

### 빌드 및 실행

```bash
# 빌드
pnpm build

# 실행
pnpm start
```

## 개발 환경 실행 (Docker)

로컬 개발 및 테스트를 위한 독립적인 환경을 구성할 수 있습니다.

```bash
# 로컬 개발 환경 실행
docker-compose -f local-docker-compose.yml up -d
```

로컬 개발 환경은 다음 포트를 사용합니다:
- Zookeeper: 2182
- Kafka: 9093
- News-Crawler 모니터링: 9465

## 통합 환경 (NSMM 프로젝트)

이 크롤러는 NSMM 메인 프로젝트에 통합되어 있습니다. 메인 프로젝트의 일부로 실행하려면:

```bash
# 메인 프로젝트 디렉토리로 이동
cd /path/to/nsmm-project

# 전체 시스템 실행
docker-compose up -d

# 크롤러만 실행할 경우
docker-compose up -d zookeeper kafka news-crawler
```

## 사용 방법

이 서비스는 Kafka 토픽에서 메시지를 구독하여 작동합니다. 다음과 같은 형식의 JSON 메시지를 Kafka 토픽(`news-keywords`)에 발행하면 해당 키워드로 네이버 뉴스를 크롤링합니다.

```json
{
  "keyword": "삼정",
  "periods": ["1w", "1m", "all"]
}
```

### 환경 변수 설정

`.env` 파일을 통해 다음과 같은 설정을 변경할 수 있습니다:

```
# Kafka 설정
KAFKA_CLIENT_ID=news-crawler
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=news-keywords
KAFKA_GROUP_ID=news-crawler-group

# 크롤러 설정
CRAWLER_HEADLESS=true
CRAWLER_USER_AGENT=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
CRAWLER_TIMEOUT=30000

# 네이버 뉴스 검색 URL 포맷
NAVER_NEWS_SEARCH_URL_FORMAT=https://search.naver.com/search.naver?ssc=tab.news.all&query={keyword}&sm=tab_opt&sort=1&photo=0&field=0&pd={period}&ds=&de=&docid=&related=0&mynews=0&office_type=0&office_section_code=0&news_office_checked=&nso=so%3Add%2Cp%3A{period_value}&is_sug_officeid=0&office_category=&service_area=
```

## 모니터링

### 통합 환경 모니터링
통합 환경에서는 Prometheus와 Grafana를 통해 모니터링됩니다:
- 프로메테우스: http://localhost:9090
- 그라파나: http://localhost:3001 (ID: admin / PW: admin)

## 라이센스

ISC 