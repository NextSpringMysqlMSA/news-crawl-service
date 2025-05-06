# 뉴스 크롤러 카프카 메시지 발행 가이드

이 문서는 뉴스 크롤링 시스템에 요청 메시지를 발행하는 방법을 상세히 설명합니다.

## 시스템 구성 개요

뉴스 크롤링 시스템은 다음과 같은 구조로 작동합니다:

1. **메시지 발행**: 외부 시스템에서 카프카의 `news-keywords` 토픽으로 크롤링 요청 메시지를 발행합니다.
2. **메시지 소비**: 크롤러 서비스가 `news-keywords` 토픽에서 메시지를 소비하고 요청된 키워드와 조건에 따라 뉴스를 크롤링합니다.
3. **결과 발행**: 크롤링 결과는 `news-results` 토픽으로 발행됩니다.
4. **결과 소비**: 결과 처리 시스템이 `news-results` 토픽에서 크롤링 결과를 수신합니다.

## 카프카 사용 환경

* **브로커 주소**: `kafka:9092` (도커 네트워크 내부) 또는 `localhost:9092` (로컬 머신에서 접근 시)
* **입력 토픽**: `news-keywords`
* **출력 토픽**: `news-results`
* **컨슈머 그룹**: `news-crawler-group`

## 메시지 발행 형식 (상세)

### 기본 메시지 구조

카프카에 보내는 메시지는 다음과 같은 JSON 형식이어야 합니다:

```json
{
  "keyword": "검색할 키워드",
  "periods": ["검색 기간 코드들"],
  "sources": ["뉴스 소스 코드들"]  // 선택 사항
}
```

### 필드 상세 설명

#### 1. keyword (필수)
- **설명**: 크롤링할 뉴스 검색 키워드
- **타입**: 문자열
- **예시**: `"삼성전자"`, `"반도체"`, `"인공지능"`
- **제한사항**: 최대 100자, 유효한 검색어여야 함
- **인코딩**: UTF-8

#### 2. periods (필수)
- **설명**: 검색 기간 코드 배열
- **타입**: 문자열 배열
- **유효한 값**:
  - `"1d"`: 최근 1일 이내 발행된 뉴스
  - `"1w"`: 최근 1주일 이내 발행된 뉴스
  - `"1m"`: 최근 1개월 이내 발행된 뉴스
  - `"3m"`: 최근 3개월 이내 발행된 뉴스
  - `"6m"`: 최근 6개월 이내 발행된 뉴스
  - `"1y"`: 최근 1년 이내 발행된 뉴스
  - `"all"`: 전체 기간의 뉴스
- **특징**: 
  - 여러 기간을 동시에 지정 가능 (예: `["1d", "1w"]`)
  - 여러 기간 지정 시 각 기간별로 별도 크롤링 후 결과가 `news-results` 토픽으로 순차 발행됨
- **제한사항**: 배열에 최소 1개 이상의 유효한 기간 코드가 포함되어야 함

#### 3. sources (선택 사항)
- **설명**: 크롤링할 뉴스 소스 코드 배열
- **타입**: 문자열 배열
- **유효한 값**:
  - `"naver"`: 네이버 뉴스
  - `"google-news"`: 구글 뉴스
- **기본값**: 필드를 생략하면 모든 소스에서 크롤링
- **제한사항**: 유효한 소스 코드만 허용됨

### 메시지 키 (Message Key)

- **형식**: 크롤링 요청의 키워드
- **목적**: 메시지 라우팅 및 파티셔닝
- **예시**: 키워드가 "삼성전자"인 경우, 메시지 키는 "삼성전자"

### 메시지 헤더 (선택 사항)

필요에 따라 다음과 같은 메시지 헤더를 설정할 수 있습니다:

- `request-id`: 요청 추적용 고유 ID
- `priority`: 처리 우선순위 (`high`, `normal`, `low`)

## 메시지 발행 시 고려사항

### 중복 메시지 처리
- 크롤러 서비스는 30분 이내에 전송된 동일한 요청을 중복으로 처리하지 않습니다.
- 동일한 요청 판단 기준: 동일한 키워드, 기간, 소스 조합

### 백프레셔 처리
- 크롤러 서비스는 과부하 시 메시지 처리를 일시 중지할 수 있습니다.
- 메시지 발행 시 과도한 요청을 피하는 것이 좋습니다.

### 오류 처리
- 크롤링 실패 시 오류 정보는 `news-keywords.dead-letter` 토픽으로 발행됩니다.
- 영구적 오류는 재시도되지 않으며, 일시적 오류는 최대 5회까지 재시도됩니다.

## 결과 메시지 형식

크롤링 결과는 `news-results` 토픽으로 다음과 같은 형식으로 발행됩니다:

```json
{
  "keyword": "검색 키워드",
  "period": "검색 기간 코드",
  "timestamp": "2023-11-01T12:34:56Z",
  "source": "뉴스 소스 코드",
  "newsItems": [
    {
      "title": "뉴스 제목",
      "url": "뉴스 URL",
      "press": "언론사",
      "publishedAt": "2023-10-31T09:30:00Z",
      "summary": "뉴스 요약"
    }
    // 추가 뉴스 아이템...
  ]
}
```

### 결과 메시지 필드 설명

- **keyword**: 검색에 사용된 키워드
- **period**: 검색에 사용된 기간 코드
- **timestamp**: 크롤링 완료 시간 (ISO 8601 형식)
- **source**: 크롤링 소스 코드
- **newsItems**: 크롤링된 뉴스 항목 배열
  - **title**: 뉴스 제목
  - **url**: 뉴스 원문 URL
  - **press**: 발행 언론사
  - **publishedAt**: 뉴스 발행 시간 (ISO 8601 형식)
  - **summary**: 뉴스 요약 (선택적)

## 결과 확인 방법

크롤링 결과는 다음과 같은 방법으로 확인할 수 있습니다:

- **Kafka UI**: http://localhost:8081
  - 토픽: `news-results`
  - 메시지 형식: JSON

- **프로메테우스/그라파나**: http://localhost:3001
  - 사용자: admin
  - 비밀번호: admin
  - 크롤링 성공/실패 메트릭 확인 가능

## 메시지 발행 구현 예시

메시지 발행은 다양한 언어와 라이브러리를 사용하여 구현할 수 있습니다:

### Java (Kafka Clients)

```java
Properties props = new Properties();
props.put("bootstrap.servers", "localhost:9092");
props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");

Producer<String, String> producer = new KafkaProducer<>(props);

String keyword = "삼성전자";
String message = "{\"keyword\":\"" + keyword + "\",\"periods\":[\"1w\"],\"sources\":[\"naver\"]}";

ProducerRecord<String, String> record = 
    new ProducerRecord<>("news-keywords", keyword, message);

producer.send(record);
producer.close();
```

### Python (kafka-python)

```python
from kafka import KafkaProducer
import json

producer = KafkaProducer(
    bootstrap_servers=['localhost:9092'],
    value_serializer=lambda v: json.dumps(v).encode('utf-8'),
    key_serializer=lambda k: k.encode('utf-8')
)

keyword = "삼성전자"
message = {
    "keyword": keyword,
    "periods": ["1w"],
    "sources": ["naver"]
}

producer.send("news-keywords", key=keyword, value=message)
producer.flush()
producer.close()
```

### Go (Sarama)

```go
package main

import (
	"encoding/json"
	"github.com/Shopify/sarama"
	"log"
)

func main() {
	config := sarama.NewConfig()
	config.Producer.RequiredAcks = sarama.WaitForAll
	config.Producer.Retry.Max = 5
	config.Producer.Return.Successes = true

	producer, err := sarama.NewSyncProducer([]string{"localhost:9092"}, config)
	if err != nil {
		log.Fatalf("Failed to create producer: %s", err)
	}
	defer producer.Close()

	type CrawlRequest struct {
		Keyword string   `json:"keyword"`
		Periods []string `json:"periods"`
		Sources []string `json:"sources,omitempty"`
	}

	request := CrawlRequest{
		Keyword: "삼성전자",
		Periods: []string{"1w"},
		Sources: []string{"naver"},
	}

	value, err := json.Marshal(request)
	if err != nil {
		log.Fatalf("Failed to marshal request: %s", err)
	}

	msg := &sarama.ProducerMessage{
		Topic: "news-keywords",
		Key:   sarama.StringEncoder(request.Keyword),
		Value: sarama.ByteEncoder(value),
	}

	_, _, err = producer.SendMessage(msg)
	if err != nil {
		log.Fatalf("Failed to send message: %s", err)
	}
}
```

## 문제 해결

- **메시지 발행 실패**: 도커 컴포즈가 제대로 실행 중인지 확인하세요.
- **크롤링 결과 없음**: 키워드, 기간, 소스 조합이 유효한지 확인하세요.
- **중복 메시지 처리 안됨**: 동일 요청은 30분 내 중복 처리되지 않습니다.
- **오류 발생 시**: 데드레터 큐(`news-keywords.dead-letter`)를 확인하세요.
