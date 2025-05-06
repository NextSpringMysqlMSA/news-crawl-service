# 로컬 개발 환경 안내

이 문서는 NSMM 프로젝트 통합 이후 개별 테스트를 위한 로컬 개발 환경 설정 방법을 설명합니다.

## 개요

NSMM 프로젝트에 news-pick 크롤러가 통합되었지만, 개별 개발 및 테스트를 위해 별도의 로컬 환경을 구성할 수 있습니다. 이 환경은 메인 프로젝트와 포트 충돌 없이 독립적으로 실행됩니다.

## 로컬 환경 구성 파일

- `local-docker-compose.yml`: 로컬 개발용 Docker Compose 설정

## 로컬 환경 실행 방법

```bash
# 로컬 개발 환경 시작
docker-compose -f local-docker-compose.yml up -d

# 특정 서비스만 실행 (예: 크롤러)
docker-compose -f local-docker-compose.yml up -d zookeeper kafka news-crawler

# 로그 확인
docker-compose -f local-docker-compose.yml logs -f news-crawler

# 환경 중지
docker-compose -f local-docker-compose.yml down
```

## 포트 정보

로컬 환경은 메인 프로젝트와 포트 충돌을 피하기 위해 다른 포트를 사용합니다:

| 서비스 | 로컬 환경 포트 | 메인 프로젝트 포트 |
|--------|---------------|------------------|
| Zookeeper | 2182 | 2181 |
| Kafka | 9093 | 9092 |
| 크롤러 모니터링 | 9465 | 9464 |

## 로컬 테스트 메시지 발행

Kafka 테스트 메시지를 로컬 환경에 발행하려면:

```bash
# 컨테이너에 접속
docker exec -it local-kafka bash

# 토픽 생성 (필요한 경우)
kafka-topics --create --topic news-keywords --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1

# 메시지 발행
kafka-console-producer --topic news-keywords --bootstrap-server localhost:9092
```

메시지 예시:
```json
{"keyword": "삼정", "periods": ["1w", "1m", "all"]}
```

## 문제 해결

1. 포트 충돌 발생 시:
   - `local-docker-compose.yml` 파일에서 포트 매핑을 변경하세요.

2. 컨테이너 접속 문제:
   - `docker exec -it local-kafka bash` 명령으로 컨테이너에 직접 접속할 수 있습니다.

3. 로그 확인:
   - `docker-compose -f local-docker-compose.yml logs -f [서비스명]` 