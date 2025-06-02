# ESG 뉴스 크롤링 및 분석 서비스 설정 가이드

## 🔒 보안 경고

**⚠️ 중요: 민감한 정보 보호**

- **API 키, 시크릿, 비밀번호는 절대 코드 저장소에 커밋하지 마세요**
- `.env` 파일을 `.gitignore`에 추가하여 버전 관리에서 제외하세요
- 실제 운영 환경에서는 환경 변수나 시크릿 관리 서비스를 사용하세요
- 네이버 API 자격 증명을 포함한 모든 민감한 정보는 암호화하여 저장하세요
- 개발팀 간 API 키 공유 시 안전한 채널을 사용하세요

## 개요

이 문서는 Docker를 사용하여 ESG 뉴스 크롤링 및 분석 서비스를 설정하고 구성하는 방법을 설명합니다. Kafka 통합, 환경 변수 구성, 배포 문제 해결을 포함합니다.

## 최근 업데이트 사항

### 2024년 6월 업데이트

1. **API 연결 개선**: 프론트엔드-백엔드 간 포트 설정 최적화 (포트 8080 사용)
2. **한글 인코딩 지원**: UTF-8 인코딩 설정으로 한글 검색어 처리 개선
3. **보안 강화**: 민감한 정보 보호를 위한 보안 가이드라인 추가
4. **환경 변수 개선**: 더 나은 설정 관리를 위한 환경 변수 구조 개선

## 완료된 작업

### 1. Docker Compose YAML 구문 오류 수정

- **문제**: Docker Compose 파일에 중복된 ports/volumes 섹션
- **해결**: 중복 키 제거 및 구문 정리
- **파일**:
  - `backend/news-crawl-service/local-docker-compose.yml`
  - `backend/ESG-NewsAnalysis/local-docker-compose.yaml`

### 2. 환경 변수 구성

뉴스 크롤링 서비스와 ESG 분석 서비스 모두에 대해 `.env` 파일 생성 및 구성

#### 뉴스 크롤링 서비스 환경 변수 (`backend/news-crawl-service/.env`)

```env
# Naver API 설정 (⚠️ 실제 값을 입력하세요)
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret

# Kafka 설정
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
KAFKA_TOPIC=esg-news

# 애플리케이션 설정
SPRING_PROFILES_ACTIVE=local

# 인코딩 설정 (한글 검색어 지원)
SPRING_HTTP_ENCODING_CHARSET=UTF-8
SPRING_HTTP_ENCODING_ENABLED=true
SPRING_HTTP_ENCODING_FORCE=true
```

#### 회사 API 서비스 환경 변수 (`backend/company-api-service/.env`)

```env
# 서버 설정
SERVER_PORT=8080
SPRING_PROFILES_ACTIVE=local

# 데이터베이스 설정
SPRING_DATASOURCE_URL=jdbc:h2:mem:testdb
SPRING_DATASOURCE_DRIVER_CLASS_NAME=org.h2.Driver

# 인코딩 설정
SPRING_HTTP_ENCODING_CHARSET=UTF-8
SPRING_HTTP_ENCODING_ENABLED=true
SPRING_HTTP_ENCODING_FORCE=true
```

#### ESG 분석 서비스 환경 변수 (`backend/ESG-NewsAnalysis/.env`)

```env
# Kafka 설정
KAFKA_BOOTSTRAP_SERVERS=localhost:9093
KAFKA_TOPIC=esg-news
KAFKA_GROUP_ID=esg-analyzer-group

# 모델 설정
MODEL_CACHE_DIR=/app/models
LOG_LEVEL=INFO
```

### 3. Naver API 자격 증명 추가

- **추가됨**: NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 환경 변수
- **목적**: 네이버 뉴스 API 접근을 위한 인증 정보 제공

### 4. Docker Compose 업데이트

- **추가됨**: `env_file: - .env` 구성으로 환경 변수 로딩
- **개선됨**: 적절한 환경 변수 로딩을 위한 구성

### 5. Kafka 연결 설정 구성

- **로컬 환경**: 올바른 포트 설정 (9093)
- **내부 통신**: localhost:9092
- **네트워크 모드**: ESG 분석기에 호스트 네트워킹 사용

### 6. Docker 리소스 제한 설정

ESG 분석 서비스를 위한 메모리 제한 구성:

```yaml
deploy:
  resources:
    limits:
      memory: 4G
    reservations:
      memory: 2G
```

## 현재 서비스 구성

### 1. 뉴스 크롤링 서비스

- **위치**: `backend/news-crawl-service/`
- **기능**: Naver API를 사용한 ESG 관련 뉴스 크롤링
- **출력**: Kafka로 뉴스 데이터 전송

### 2. ESG 분석 서비스

- **위치**: `backend/ESG-NewsAnalysis/`
- **기능**: 크롤링된 뉴스의 ESG 분석 및 분류
- **입력**: Kafka에서 뉴스 데이터 수신

## 배포 및 실행 가이드

### 1. 사전 요구사항

```bash
# Docker 및 Docker Compose 설치 확인
docker --version
docker-compose --version

# Kafka 서비스 실행 (필요한 경우)
cd backend
./run-core-services.sh
```

### 2. 환경 변수 설정

각 서비스 디렉토리에서 `.env` 파일의 값들을 실제 값으로 업데이트:

```bash
# 뉴스 크롤링 서비스
cd backend/news-crawl-service/
# .env 파일에서 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 설정

# ESG 분석 서비스
cd ../ESG-NewsAnalysis/
# .env 파일에서 Kafka 및 모델 설정 확인
```

### 3. 서비스 실행

```bash
# 뉴스 크롤링 서비스 실행
cd backend/news-crawl-service/
docker-compose -f local-docker-compose.yml up -d

# ESG 분석 서비스 실행
cd ../ESG-NewsAnalysis/
docker-compose -f local-docker-compose.yaml up -d
```

### 4. 상태 확인

```bash
# 컨테이너 상태 확인
docker ps

# 회사 API 서비스 확인 (포트 8080)
curl http://localhost:8080/health

# 한글 검색어 테스트
curl -X GET "http://localhost:8080/api/companies/search?query=LG%20스포츠" \
  -H "Content-Type: application/json; charset=utf-8"

# 로그 확인
docker logs news-crawl-service
docker logs esg-news-analyzer

# Kafka 토픽 확인
docker exec -it kafka kafka-topics.sh --list --bootstrap-server localhost:9092
```

## 테스트 절차

### 1. 엔드투엔드 테스트

```bash
# 1. 회사 API 서비스 테스트 (메인 API)
curl -X GET "http://localhost:8080/api/companies/search?query=삼성전자" \
  -H "Content-Type: application/json; charset=utf-8"

# 2. 한글 검색어 인코딩 테스트
curl -X GET "http://localhost:8080/api/companies/search?query=LG%20스포츠" \
  -H "Content-Type: application/json; charset=utf-8"

# 3. 뉴스 크롤링 서비스 API 테스트 (포트 9093)
curl -X POST http://localhost:9093/api/news/crawl \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"keyword": "ESG", "count": 10}'

# 4. Kafka 메시지 확인
docker exec -it kafka kafka-console-consumer.sh \
  --topic esg-news \
  --bootstrap-server localhost:9092 \
  --from-beginning

# 3. ESG 분석 서비스 로그 확인
docker logs esg-news-analyzer -f
```

### 2. 개별 서비스 테스트

```bash
# 회사 API 서비스 헬스체크 (포트 8080)
curl http://localhost:8080/actuator/health

# 뉴스 크롤링 서비스 헬스체크 (포트 9093)
curl http://localhost:9093/actuator/health

# 프론트엔드 서비스 확인 (포트 3000)
curl http://localhost:3000

# 데이터베이스 연결 확인
docker exec -it news-crawl-service-db psql -U postgres -d newsdb -c "SELECT 1;"
```

## 🔒 보안 고려사항

### 1. API 키 및 시크릿 관리

**필수 보안 조치:**

```bash
# .gitignore에 민감한 파일 추가
echo ".env" >> .gitignore
echo "*.key" >> .gitignore
echo "secrets/" >> .gitignore

# 환경 변수 파일 권한 설정
chmod 600 backend/news-crawl-service/.env
chmod 600 backend/company-api-service/.env
chmod 600 frontend/.env
```

**프로덕션 환경 권장사항:**

- AWS Secrets Manager, Azure Key Vault 등 시크릿 관리 서비스 사용
- 환경 변수로 민감한 정보 주입
- 정기적인 API 키 로테이션 수행

### 2. 네트워크 보안

```bash
# Docker 네트워크 격리 설정
docker network create esg-network --driver bridge

# 방화벽 설정 (macOS)
sudo pfctl -f /etc/pf.conf
```

**보안 체크리스트:**

- [ ] 불필요한 포트 노출 최소화
- [ ] HTTPS 사용 (프로덕션)
- [ ] API 인증/인가 구현
- [ ] 로그에서 민감한 정보 마스킹

### 3. 데이터 보안

```bash
# 로그 파일 권한 설정
find backend/logs -type f -exec chmod 640 {} \;

# 임시 파일 정리
find /tmp -name "*.tmp" -mtime +7 -delete
```

## 📊 모니터링 및 로깅

### 1. 로그 수집

```bash
# 모든 서비스 로그 수집 (타임스탬프 포함)
docker-compose logs -t > esg-services-$(date +%Y%m%d_%H%M%S).log

# 특정 서비스 로그 (실시간)
docker logs -f company-api-service
docker logs -f news-crawl-service

# 특정 시간 범위 로그
docker-compose logs --since "2025-06-01T00:00:00Z" --until "2025-06-02T23:59:59Z"

# 한글 인코딩 관련 로그 필터링
docker logs company-api-service 2>&1 | grep -i "encoding\|charset\|utf"
```

### 2. 성능 모니터링

```bash
# 실시간 리소스 모니터링
docker stats --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# 디스크 사용량 확인
docker system df -v

# 한글 검색 성능 테스트
time curl -X GET "http://localhost:8080/api/companies/search?query=삼성전자" \
  -H "Content-Type: application/json; charset=utf-8"
```

### 3. 모니터링 자동화

```bash
# 시스템 상태 모니터링 스크립트 생성
cat > monitor-services.sh << 'EOF'
#!/bin/bash
echo "=== ESG 서비스 상태 모니터링 ==="
echo "현재 시간: $(date)"
echo
echo "=== 포트 상태 ==="
lsof -i :3000,8080,9093 | grep LISTEN
echo
echo "=== Docker 컨테이너 상태 ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo
echo "=== API 헬스체크 ==="
curl -s http://localhost:8080/health > /dev/null && echo "✅ 회사 API (8080): OK" || echo "❌ 회사 API (8080): FAIL"
curl -s http://localhost:9093/health > /dev/null && echo "✅ 뉴스 크롤러 (9093): OK" || echo "❌ 뉴스 크롤러 (9093): FAIL"
curl -s http://localhost:3000 > /dev/null && echo "✅ 프론트엔드 (3000): OK" || echo "❌ 프론트엔드 (3000): FAIL"
EOF

chmod +x monitor-services.sh
```

## 🔄 향후 개선 사항

### 1. 완료된 작업 (2025년 6월)

- [x] 프론트엔드-백엔드 API 연결 문제 해결
- [x] 한글 검색어 인코딩 문제 해결
- [x] 포트 설정 최적화 (8080, 9093, 3000)
- [x] UTF-8 인코딩 설정 구현
- [x] 보안 가이드라인 추가

### 2. 진행 중인 작업

- [ ] 통합 시스템의 실제 배포 및 테스트
- [ ] ESG 분석 컨테이너에서 모델 다운로드 성공 확인
- [ ] 실제 뉴스 데이터를 사용한 전체 파이프라인 테스트
- [ ] 한글 검색어 처리 성능 최적화

### 3. 권장 개선사항

- 자동화된 헬스체크 구현
- CI/CD 파이프라인 구성
- 컨테이너 오케스트레이션 (Kubernetes) 고려
- 백업 및 복구 전략 수립

## 관련 파일

### 주요 구성 파일

- `backend/news-crawl-service/local-docker-compose.yml`
- `backend/news-crawl-service/.env`
- `backend/ESG-NewsAnalysis/local-docker-compose.yaml`
- `backend/ESG-NewsAnalysis/.env`
- `backend/ESG-NewsAnalysis/modelkafka.py`

### 스크립트 파일

- `backend/run-core-services.sh` - 핵심 서비스 실행
- `backend/stop-core-services.sh` - 서비스 중지

## 연락처 및 지원

이 설정과 관련하여 문제가 발생하면 다음을 확인하세요:

### 🔧 기술적 문제 해결

1. **Docker 및 Docker Compose 버전 호환성**

   ```bash
   docker --version  # 20.10.0 이상 권장
   docker-compose --version  # 1.29.0 이상 권장
   ```

2. **포트 충돌 확인**

   ```bash
   # 주요 포트 사용 현황 확인
   lsof -i :3000,8080,9092,9093
   # 포트 해제 (필요시)
   sudo kill -9 $(lsof -t -i:8080)
   ```

3. **시스템 리소스 요구사항**

   - 최소 8GB RAM 권장 (ESG 분석 모델용)
   - 디스크 여유 공간 5GB 이상
   - CPU: 2코어 이상 권장

4. **네트워크 및 방화벽 설정**
   ```bash
   # macOS 방화벽 상태 확인
   sudo pfctl -s rules | grep -E "(8080|9093|3000)"
   ```

### 🔐 보안 점검 사항

1. **민감한 정보 노출 방지**

   ```bash
   # Git 상태 확인
   git status | grep -E "\.env|secret|key"

   # .gitignore 확인
   cat .gitignore | grep -E "\.env|secret|key"
   ```

2. **API 키 유효성 확인**
   - 네이버 개발자 센터에서 API 키 상태 확인
   - 일일 요청 제한 및 사용량 모니터링

### 📊 성능 최적화

1. **한글 검색 성능 테스트**

   ```bash
   # 검색 응답 시간 측정
   time curl -X GET "http://localhost:8080/api/companies/search?query=삼성전자" \
     -H "Content-Type: application/json; charset=utf-8"
   ```

2. **메모리 사용량 최적화**
   ```bash
   # JVM 힙 메모리 설정 확인
   docker exec company-api-service java -XX:+PrintFlagsFinal -version | grep HeapSize
   ```

---

**📝 변경 이력:**

- 2025년 6월 2일: API 연결 문제 해결, 한글 인코딩 지원, 보안 가이드라인 추가
- 이전 버전: 초기 Docker 설정 및 Kafka 통합

**🛡️ 보안 정책:**
이 문서에 포함된 모든 예시 API 키와 시크릿은 실제 값이 아닙니다.
실제 운영 환경에서는 반드시 안전한 시크릿 관리 방식을 사용하세요.
