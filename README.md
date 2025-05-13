# News-Crawl-Service

다양한 뉴스 소스(네이버 뉴스 API, 구글 뉴스 RSS 등)에서 키워드 기반으로 뉴스를 수집하는 서비스입니다. Kafka 토픽을 구독하여 키워드를 받고, 설정된 뉴스 소스에서 뉴스를 수집하여 결과를 다시 Kafka로 전송합니다.

## 프로젝트 개요

이 서비스는 다음과 같은 특징을 가지고 있습니다:

- **다중 소스 지원**: 네이버 뉴스 API, 구글 뉴스 RSS 등 다양한 소스 지원
- **플러그인 아키텍처**: 확장 가능한 크롤러 플러그인 시스템
- **Kafka 메시지 처리**: 비동기 크롤링 요청 처리 및 결과 발행
- **모니터링 시스템**: Prometheus와 Grafana를 통한 실시간 모니터링
- **지수 백오프 재시도**: 일시적 오류에 대한 효율적인 재시도 전략

## 기술 스택

- **런타임**: Node.js
- **언어**: TypeScript
- **메시징**: KafkaJS (Kafka 클라이언트)
- **HTTP 클라이언트**: Axios
- **파싱**: XML2JS (RSS 피드 파싱) 
- **웹 크롤링**: Puppeteer (필요시)
- **모니터링**: Prometheus, Express
- **로깅**: Winston
- **유효성 검사**: Zod
- **패키지 관리**: pnpm
- **포맷팅/린팅**: Biome

## 시스템 아키텍처

서비스는 다음과 같은 주요 컴포넌트로 구성되어 있습니다:

- **Kafka Consumer**: 크롤링 요청 수신 및 크롤러 서비스 호출
- **크롤러 레지스트리**: 플러그인 크롤러 관리 및 팩토리 패턴 구현
- **크롤러 플러그인**: 각 뉴스 소스별 구현체 (네이버, 구글 뉴스 등)
- **Kafka Producer**: 크롤링 결과 발행
- **모니터링 서버**: Prometheus 지표 노출

## 디렉토리 구조

```
src/
├── config/        # 환경 변수 및 설정
├── core/          # 핵심 인터페이스 및 추상 클래스
├── monitoring/    # 모니터링 지표 및 서버
├── plugins/       # 크롤러 플러그인
│   └── crawlers/  # 소스별 크롤러 구현체
├── services/      # Kafka 연동 서비스 및 주요 서비스
├── types/         # 전역 타입 정의
└── utils/         # 공통 유틸리티 및 로거
```

## 설치 및 설정

### 요구사항

- Node.js 18 이상
- pnpm
- Docker 및 Docker Compose (로컬 개발 환경용)

### 설치

```bash
# 패키지 설치
pnpm install

# 환경 변수 파일 생성
cp env.example.txt .env
# .env 파일을 열어 필요한 값 설정
```

### 환경 변수 설정

`.env` 파일에 다음과 같은 필수 환경 변수를 설정해야 합니다:

```
# Kafka 설정
KAFKA_CLIENT_ID=news-crawler
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=news-keywords
KAFKA_GROUP_ID=news-crawler-group
KAFKA_RESULT_TOPIC=news-results

# 네이버 API 설정 (네이버 개발자 센터에서 발급 필요)
NAVER_CLIENT_ID=your_client_id
NAVER_CLIENT_SECRET=your_client_secret

# 모니터링 설정
MONITORING_ENABLED=true
MONITORING_PORT=9464
MONITORING_PATH=/metrics
```

전체 환경 변수 목록과 설명은 `env.example.txt` 파일을 참조하세요.

## 실행 방법

### 개발 모드

```bash
# 개발 모드로 실행 (ts-node를 통한 직접 실행)
pnpm dev
```

### 빌드 및 프로덕션 실행

```bash
# 빌드
pnpm build

# 빌드된 파일 실행
pnpm start
```

### 크롤러 테스트

특정 크롤러만 로컬에서 테스트하려면:

```bash
# 테스트 크롤러 실행 (빌드 후)
pnpm local-test
```

### 문서 생성

TypeDoc을 사용하여 API 문서를 생성할 수 있습니다:

```bash
pnpm docs
```

생성된 문서는 `docs/` 디렉토리에서 확인할 수 있습니다.

## 도커 개발 환경

### 로컬 개발 환경 실행

```bash
# 로컬 개발 환경 시작 (Zookeeper, Kafka, Prometheus, Grafana)
docker-compose -f local-docker-compose.yml up -d
```

로컬 개발 환경은 다음 포트를 사용합니다:
- Zookeeper: 2182
- Kafka: 9093
- 크롤러 모니터링: 9465

자세한 내용은 [LOCAL_DEV.md](LOCAL_DEV.md) 파일을 참조하세요.

### 테스트 메시지 발행

로컬 환경에서 카프카 테스트 메시지를 발행하는 방법은 [kafka-producer-readme.md](kafka-producer-readme.md) 문서를 참조하세요.

## 크롤러 개발 가이드

새로운 뉴스 소스 크롤러를 개발하려면 다음 단계를 따르세요:

1. `src/plugins/crawlers/{소스명}/` 디렉토리를 생성합니다.
2. 크롤러 클래스와 팩토리 클래스를 구현합니다:
   - `{소스명}-crawler.ts`: `NewsCrawler` 인터페이스 구현
   - `{소스명}-crawler-factory.ts`: `CrawlerFactory` 인터페이스 구현
   - `index.ts`: 내보내기 파일
3. `src/plugins/register-plugins.ts`에 새 크롤러 팩토리를 등록합니다.

자세한 내용은 [CONTRIBUTING.md](CONTRIBUTING.md) 파일을 참조하세요.

## 모니터링

### Prometheus 지표

- 기본 경로: `http://localhost:9464/metrics`
- 주요 지표: 크롤링 성공/실패 횟수, 처리 시간, 결과 수 등

### Grafana 대시보드

로컬 개발 환경에서:
- URL: http://localhost:3001
- 로그인: admin/admin

## 문제 해결

### 일반적인 문제

1. **Kafka 연결 오류**
   - Kafka 브로커 주소가 올바른지 확인하세요.
   - `docker-compose -f local-docker-compose.yml logs kafka`로 로그를 확인하세요.

2. **크롤링 결과 없음**
   - 네이버 API 키가 올바르게 설정되었는지 확인하세요.
   - 검색 키워드가 유효한지 확인하세요.

3. **메모리 사용량 과다**
   - `CRAWLER_CONCURRENT_LIMIT` 값을 낮춰보세요.
   - 크롤링 결과 데이터 양을 제한하세요.

## 기여 방법

프로젝트에 기여하고 싶으신가요? [CONTRIBUTING.md](CONTRIBUTING.md) 파일을 참조하세요.

## 라이센스

ISC 