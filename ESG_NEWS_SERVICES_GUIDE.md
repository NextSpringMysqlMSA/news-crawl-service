# ESG 뉴스 서비스 실행 가이드

이 가이드는 ESG 뉴스 크롤러와 분석기 서비스를 Docker를 사용해 로컬에서 실행하는 방법을 설명합니다.

## 🔒 보안 경고

**⚠️ 중요: 민감한 정보 보호**

- **API 키와 시크릿은 절대 코드 저장소에 업로드하지 마세요**
- `.env` 파일을 `.gitignore`에 추가하여 버전 관리에서 제외하세요
- 실제 API 키 값들은 별도로 안전하게 관리하고 직접 입력해야 합니다
- 프로덕션 환경에서는 환경 변수나 시크릿 관리 도구를 사용하세요
- 네이버 API 자격 증명을 포함한 모든 민감한 정보는 암호화된 저장소에 보관하세요

## 📋 목차

1. [사전 요구사항](#사전-요구사항)
2. [환경 변수 설정](#환경-변수-설정)
3. [서비스 구성](#서비스-구성)
4. [실행 방법](#실행-방법)
5. [테스트 방법](#테스트-방법)
6. [문제 해결](#문제-해결)
7. [보안 고려사항](#보안-고려사항)

## 🔧 사전 요구사항

- Docker 및 Docker Compose 설치
- Naver Search API 계정 및 자격 증명
- 로컬 Kafka 클러스터 (포트 9093)
- 최소 6GB RAM (ESG 분석기용)

## ⚙️ 환경 변수 설정

### 1. 뉴스 크롤러 서비스 (.env)

`backend/news-crawl-service/.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
# Naver Search API 자격 증명 (⚠️ 실제 값을 입력하세요)
NAVER_CLIENT_ID=your_naver_client_id_here
NAVER_CLIENT_SECRET=your_naver_client_secret_here

# 서비스 설정
SERVER_PORT=9093
SPRING_PROFILES_ACTIVE=local

# 인코딩 설정 (한글 검색어 지원)
SPRING_HTTP_ENCODING_CHARSET=UTF-8
SPRING_HTTP_ENCODING_ENABLED=true
SPRING_HTTP_ENCODING_FORCE=true

# Kafka 설정
KAFKA_BOOTSTRAP_SERVERS=localhost:9093
KAFKA_TOPIC_NEWS=news-events
```

### 2. ESG 뉴스 분석기 (.env)

`backend/ESG-NewsAnalysis/.env` 파일을 생성하고 다음 내용을 추가하세요:

```env
# Kafka 설정
KAFKA_BOOTSTRAP_SERVERS=localhost:9093
KAFKA_CONSUMER_GROUP=esg-analyzer
KAFKA_TOPIC_NEWS=news-events
KAFKA_TOPIC_ESG=esg-analysis-results

# API 설정
NAVER_CLIENT_ID=your_naver_client_id_here
NAVER_CLIENT_SECRET=your_naver_client_secret_here

# 분석 설정
ESG_MODEL_PATH=/app/models
LOG_LEVEL=INFO
```

## 🏗️ 서비스 구성

### 뉴스 크롤러 서비스 (news-crawl-service)

- **포트**: 9093
- **기능**: Naver 뉴스 API를 통한 뉴스 크롤링
- **Kafka 토픽**: `news-events` (Producer)

### ESG 뉴스 분석기 (ESG-NewsAnalysis)

- **네트워크**: Host 모드
- **메모리**: 4GB 제한, 2GB 예약
- **기능**: 뉴스 ESG 분류 및 분석
- **Kafka 토픽**: `news-events` (Consumer), `esg-analysis-results` (Producer)

## 🚀 실행 방법

### 1. 뉴스 크롤러 서비스 시작

```bash
news-crawl-service 에서
docker-compose -f local-docker-compose.yml up -d
```

### 2. ESG 뉴스 분석기 시작

```bash
ESG-NewsAnalysis 에서
docker-compose -f local-docker-compose.yaml up -d
```

### 4. 회사 API 서비스 시작 (필수)

메인 회사 정보 API 서비스도 함께 실행되어야 합니다:

**또는 IDE에서 직접 실행:**

- `CompanyApiServiceApplication.java` 파일을 실행
- 포트 8080에서 서비스가 시작됩니다

### 5. 서비스 상태 확인

```bash
# 컨테이너 상태 확인
docker ps

# 메인 API 서비스 확인
curl http://localhost:8080/health

# 로그 확인
docker logs news-crawl-service
docker logs esg-news-analyzer
```

## 🧪 테스트 방법

### 1. Kafka 메시지 확인

뉴스 이벤트 토픽 모니터링:

```bash
docker exec -it kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9093 \
  --topic news-events \
  --from-beginning
```

ESG 분석 결과 토픽 모니터링:

```bash
docker exec -it kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9093 \
  --topic esg-analysis-results \
  --from-beginning
```

### 2. 테스트 메시지 발송

```bash
docker exec -it kafka kafka-console-producer.sh \
  --bootstrap-server localhost:9093 \
  --topic news-events
```

다음 JSON 메시지를 입력하세요:

```json
{
  "title": "삼성전자, 친환경 기술 투자 확대",
  "content": "삼성전자가 ESG 경영 강화를 위해 친환경 기술 개발에 대규모 투자를 발표했다.",
  "url": "https://example.com/news/1",
  "publishedDate": "2025-06-02T10:00:00Z",
  "source": "테스트뉴스"
}
```

### 3. API 엔드포인트 테스트

뉴스 크롤러 헬스체크:

```bash
curl http://localhost:9093/health
```

회사 API 서비스 헬스체크:

```bash
curl http://localhost:8080/health
```

한글 검색어 테스트:

```bash
curl -X GET "http://localhost:8080/api/companies/search?query=LG%20스포츠" \
  -H "Content-Type: application/json; charset=utf-8"
```

## 🔍 문제 해결

### 한글 검색어 인코딩 문제

**증상**: 한글 검색어가 잘려서 나타나는 현상 (예: "LG 스포츠" → "LG 스")

**해결방법**:

1. 백엔드 UTF-8 인코딩 설정 확인:

   - `application.yml`에 인코딩 설정이 있는지 확인
   - `WebConfig.java`에 `StringHttpMessageConverter` 설정 확인

2. 프론트엔드 요청 헤더 확인:
   ```javascript
   headers: {
     'Content-Type': 'application/json; charset=utf-8'
   }
   ```

### API 연결 오류

**증상**: 프론트엔드에서 백엔드 API 호출 시 404 오류

**해결방법**:

1. 환경 변수 확인:

   ```bash
   # frontend/.env
   NEXT_DART_API_URL=http://localhost:8080
   ```

2. 백엔드 서비스가 올바른 포트에서 실행 중인지 확인:
   ```bash
   netstat -an | grep 8080
   ```

### 환경 변수 오류

**증상**: `NAVER_CLIENT_ID` 또는 `NAVER_CLIENT_SECRET` 누락 오류

**해결방법**:

1. `.env` 파일이 올바른 경로에 있는지 확인
2. 환경 변수 값에 공백이나 특수문자가 없는지 확인
3. Docker Compose 파일에 `env_file` 설정이 있는지 확인

### 포트 충돌

**증상**: 포트 바인딩 오류

**해결방법**:

```bash
# 포트 사용 상황 확인
lsof -i :9093

# 기존 프로세스 종료
sudo kill -9 <PID>
```

### 메모리 부족

**증상**: ESG 분석기 컨테이너가 재시작됨

**해결방법**:

1. Docker Desktop 메모리 할당량 증가 (최소 6GB)
2. 다른 불필요한 애플리케이션 종료
3. 메모리 제한 조정:

```yaml
deploy:
  resources:
    limits:
      memory: 6G
    reservations:
      memory: 3G
```

### Kafka 연결 오류

**증상**: Kafka 브로커 연결 실패

**해결방법**:

1. Kafka 서비스가 실행 중인지 확인
2. 포트 9093이 열려있는지 확인
3. 네트워크 설정 확인

## 🔒 보안 고려사항

### API 키 관리

1. **환경 변수 사용**: 프로덕션에서는 시스템 환경 변수 사용
2. **액세스 제한**: 필요한 서비스에만 API 키 접근 권한 부여
3. **정기적인 키 교체**: 보안을 위해 정기적으로 API 키 갱신
4. **로그 마스킹**: 로그에 민감한 정보가 노출되지 않도록 설정

### 네트워크 보안

1. **방화벽 설정**: 필요한 포트만 열어두기
2. **HTTPS 사용**: 프로덕션 환경에서는 HTTPS 프로토콜 사용
3. **인증/인가**: API 엔드포인트에 적절한 인증 메커니즘 구현

### 데이터 보안

1. **민감한 데이터 암호화**: 데이터베이스와 전송 구간에서 암호화 적용
2. **접근 로그**: 모든 API 접근에 대한 로그 기록
3. **데이터 백업**: 정기적인 백업과 복구 테스트

## 📊 로그 모니터링

### 실시간 로그 확인

```bash
# 뉴스 크롤러 로그
docker logs -f news-crawl-service

# ESG 분석기 로그
docker logs -f esg-news-analyzer

# 모든 서비스 로그
docker-compose -f local-docker-compose.yml logs -f
```

### 로그 파일 위치

- 뉴스 크롤러: `backend/news-crawl-service/logs/`
- ESG 분석기: `backend/ESG-NewsAnalysis/logs/`

## 🛑 서비스 중지

### 개별 서비스 중지

```bash
# 뉴스 크롤러 중지
docker-compose -f local-docker-compose.yml down

# ESG 분석기 중지
docker-compose -f local-docker-compose.yaml down
```

## 📝 추가 정보

### Docker Compose 파일 구조

**뉴스 크롤러** (`local-docker-compose.yml`):

```yaml
version: "3.8"
services:
  news-crawl-service:
    build: .
    container_name: news-crawl-service
    env_file:
      - .env
    ports:
      - "9093:9093"
    restart: unless-stopped
```

**ESG 분석기** (`local-docker-compose.yaml`):

```yaml
version: "3.8"
services:
  esg-news-analyzer:
    build: .
    container_name: esg-news-analyzer
    env_file:
      - .env
    network_mode: host
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 4G
        reservations:
          memory: 2G
```

### 성능 최적화 팁

1. **메모리 사용량 모니터링**:

   ```bash
   docker stats esg-news-analyzer
   ```

2. **디스크 사용량 확인**:

   ```bash
   docker system df
   ```

3. **이미지 정리**:
   ```bash
   docker system prune -a
   ```

## 🤝 지원

문제가 발생하면 다음을 확인하세요:

1. 모든 환경 변수가 올바르게 설정되었는지
2. Docker 서비스가 실행 중인지
3. 필요한 포트가 사용 가능한지
4. 로그 파일에서 오류 메시지 확인

---

**마지막 업데이트**: 2025년 6월 2일
