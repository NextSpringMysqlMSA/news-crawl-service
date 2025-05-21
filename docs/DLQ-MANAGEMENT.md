# Dead Letter Queue (DLQ) 관리 가이드

## 개요

Dead Letter Queue(DLQ)는 처리에 실패한 메시지를 저장하는 특별한 큐입니다. 이 문서에서는 DLQ 메시지의 포맷과 관리 방법에 대해 설명합니다.

## DLQ 메시지 포맷

DLQ 메시지는 다음과 같은 표준화된 형식으로 저장됩니다:

```typescript
interface DeadLetterQueueMessage {
  // 메시지 메타데이터
  id: string;              // 메시지 고유 ID
  timestamp: string;       // 메시지 생성 시간 (ISO 8601)
  
  // 원본 요청 정보
  originalRequest: {       // 원본 크롤링 요청
    keyword: string;       // 검색 키워드
    periods: string[];     // 검색 기간 목록
    sources?: string[];    // 크롤링할 뉴스 소스 (선택적)
  };
  
  // 오류 정보
  errorType: ErrorType;    // 오류 유형 (NETWORK, TIMEOUT, PARSING 등)
  errorMessage: string;    // 오류 메시지
  stackTrace?: string;     // 스택 트레이스 (선택적)
  
  // 처리 시도 정보
  retryCount: number;      // 시도한 재시도 횟수
  maxRetries: number;      // 최대 재시도 횟수
  source?: string;         // 오류가 발생한 크롤러 소스
  
  // 처리 상태
  status: 'failed' | 'reprocessed' | 'ignored'; // 처리 상태
  reprocessedAt?: string;  // 재처리된 시간 (재처리된 경우에만)
}
```

## 오류 유형

크롤링 과정에서 발생할 수 있는 오류 유형은 다음과 같습니다:

| 오류 유형 | 설명 | 재시도 전략 | 
|---------|------|------------|
| NETWORK | 네트워크 연결 문제 | 최대 5회, 10초부터 시작하여 지수적으로 증가 |
| TIMEOUT | 요청 시간 초과 | 최대 3회, 5초부터 시작하여 지수적으로 증가 |
| SELECTOR | 웹 요소 선택자 관련 오류 | 최대 2회, 3초부터 시작하여 지수적으로 증가 |
| PARSING | 응답 데이터 파싱 오류 | 재시도 없음 (영구적 오류로 간주) |
| BROWSER | 브라우저 관련 오류 | 최대 2회, 5초부터 시작하여 지수적으로 증가 |
| UNKNOWN | 알 수 없는 오류 | 재시도 없음 (영구적 오류로 간주) |

## DLQ CLI 도구

DLQ 메시지를 관리하기 위한 명령줄 인터페이스(CLI) 도구가 제공됩니다.

### 설치 및 실행

```bash
# 의존성 설치
pnpm install

# DLQ CLI 도구 실행
pnpm dlq -- <command> [options]
```

### 명령어 목록

1. **메시지 분석**

   ```bash
   pnpm dlq -- analyze
   ```

   DLQ에 저장된 메시지를 분석하고 통계 정보(총 메시지 수, 오류 유형별 통계, 소스별 통계, 상태별 통계)를 출력합니다.

2. **메시지 재처리**

   ```bash
   # 모든 메시지 재처리
   pnpm dlq -- reprocess

   # 특정 소스의 메시지만 재처리
   pnpm dlq -- reprocess --source naver

   # 특정 오류 유형의 메시지만 재처리
   pnpm dlq -- reprocess --error-type network

   # 실제로 재처리하지 않고 대상 메시지만 확인
   pnpm dlq -- reprocess --source google-news --dry-run
   ```

   DLQ에 저장된 메시지를 원래 토픽으로 다시 전송하여 재처리를 시도합니다.

3. **메시지 무시 처리**

   ```bash
   # 모든 메시지 무시 처리
   pnpm dlq -- ignore

   # 특정 소스의 메시지만 무시 처리
   pnpm dlq -- ignore --source naver

   # 특정 오류 유형의 메시지만 무시 처리
   pnpm dlq -- ignore --error-type parsing

   # 실제로 무시 처리하지 않고 대상 메시지만 확인
   pnpm dlq -- ignore --error-type unknown --dry-run
   ```

   특정 메시지를 더 이상 처리하지 않도록 '무시' 상태로 표시합니다.

4. **특정 메시지 조회**

   ```bash
   # 특정 ID의 메시지 조회
   pnpm dlq -- get <message-id>
   ```

   메시지 ID를 기반으로 특정 DLQ 메시지의 상세 정보를 조회합니다.

## 주기적인 DLQ 관리

시스템의 안정적인 운영을 위해 주기적으로 DLQ 메시지를 확인하고 관리하는 것이 중요합니다. 다음과 같은 작업을 정기적으로 수행하는 것을 권장합니다:

1. **일일 모니터링**
   - DLQ 메시지 통계 확인 (오류 유형, 소스별 분포)
   - 새로운 유형의 오류가 발생하는지 확인

2. **주간 관리**
   - 특정 패턴의 오류가 지속적으로 발생하는지 확인하고 근본 원인 분석
   - 재시도할 수 있는 일시적 오류는 재처리
   - 영구적 오류는 시스템 개선을 위한 인사이트로 활용 후 필요시 무시 처리

3. **월간 정리**
   - 오래된 무시 처리된 메시지 정리
   - DLQ 관리 프로세스 개선

## 프로그래밍 방식 DLQ 관리

CLI 도구 외에도 `DeadLetterQueueManager` 클래스를 사용하여 프로그래밍 방식으로 DLQ 메시지를 관리할 수 있습니다:

```typescript
import { DeadLetterQueueManager } from "@/utils/dlq-manager";

async function manageDLQ() {
  // DLQ 관리자 인스턴스 생성
  const manager = new DeadLetterQueueManager();
  
  try {
    // 연결 초기화
    await manager.initialize();
    
    // 메시지 분석
    const stats = await manager.analyzeDLQ();
    console.log(`총 ${stats.totalMessages}개 메시지 발견`);
    
    // 특정 조건의 메시지 재처리
    const reprocessedCount = await manager.reprocessMessages(
      (message) => message.errorType === "NETWORK" && message.retryCount < 3
    );
    console.log(`${reprocessedCount}개 메시지 재처리됨`);
  } finally {
    // 연결 종료
    await manager.close();
  }
}

manageDLQ().catch(console.error);
```

## 권장 사항 및 모범 사례

1. **정기적인 모니터링**: DLQ 메시지를 정기적으로 모니터링하여 새로운 오류 패턴을 식별합니다.

2. **재처리 우선순위**:
   - 네트워크나 타임아웃과 같은 일시적인 오류는 재처리가 성공할 가능성이 높으므로 우선적으로 재처리합니다.
   - 파싱 오류는 일반적으로 영구적인 문제이므로 코드 수정이 필요할 수 있습니다.

3. **메시지 그룹 처리**: 유사한 오류를 가진 메시지를 그룹으로 처리하여 효율성을 높입니다.

4. **시스템 개선에 활용**: DLQ 메시지 분석 결과를 활용하여 크롤러의 견고성을 향상시킵니다. 