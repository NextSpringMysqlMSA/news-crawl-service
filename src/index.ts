/**
 * 뉴스 크롤링 서비스 메인 진입점
 * Kafka에서 키워드를 구독하여 다양한 뉴스 사이트의 뉴스를 크롤링합니다.
 *
 * 주요 개선사항:
 * - 코드 구조 개선과 중복 제거
 * - 고급 오류 처리 및 지수 백오프 재시도 전략
 * - 성능 최적화 및 메모리 사용량 모니터링
 */
import "module-alias/register";
import fs from "node:fs";
import path from "node:path";
import { env } from "@/config/env";
import {
	ServiceContainer,
	type ServiceContainerOptions,
} from "@/core/service-container";
import { MetricsServer } from "@/monitoring";
import { logger } from "@/utils/logger";

// 로그 디렉토리 생성
const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
	fs.mkdirSync(logDir, { recursive: true });
	logger.info(`로그 디렉토리 생성됨: ${logDir}`);
}

// ServiceContainer 옵션 설정
const containerOptions: ServiceContainerOptions = {
	// 향상된 재시도 설정
	retryOptions: {
		maxRetries: 3,
		initialDelay: 1000,
		maxDelay: 30000,
		factor: 2,
	},
	// 환경에서 동시성 제한 설정 가져옴
	concurrentLimit: env.crawler.concurrentLimit,
};

// 서비스 컨테이너 인스턴스 가져오기
const container = ServiceContainer.getInstance(containerOptions);
const metricsServer = new MetricsServer();

/**
 * 애플리케이션 종료 처리
 */
async function shutdown(): Promise<void> {
	logger.info("애플리케이션 종료 중...");

	try {
		// 서비스 컨테이너 종료 (모든 서비스를 종료)
		await container.close();
		logger.info("모든 서비스 종료 완료");

		// 모니터링 서버 종료
		if (env.monitoring.enabled) {
			await metricsServer.stop();
			logger.info("모니터링 서버 종료 완료");
		}
	} catch (error) {
		logger.error("애플리케이션 종료 중 오류 발생", error);
	} finally {
		logger.info("애플리케이션 종료 완료");
		process.exit(0);
	}
}

// 종료 시그널 처리
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// 메인 함수
async function main() {
	logger.info("뉴스 크롤러 서비스 시작 중...");

	try {
		// 모니터링 시작 (설정에서 활성화된 경우)
		if (env.monitoring.enabled) {
			try {
				metricsServer.start();
				logger.info("모니터링 서버가 성공적으로 시작되었습니다.");
			} catch (error) {
				logger.warn(
					"모니터링 서버 시작 실패, 모니터링 없이 계속됩니다.",
					error
				);
			}
		}

		// 서비스 컨테이너 초기화 (모든 서비스 초기화)
		await container.initialize();

		// Kafka 소비자 서비스 시작
		const consumerService = container.getKafkaConsumerService();
		await consumerService.start();

		logger.info("뉴스 크롤러 서비스 성공적으로 시작됨");
	} catch (error) {
		logger.error("애플리케이션 시작 실패", error);
		process.exit(1);
	}
}

// 오류 처리
process.on("uncaughtException", (error: Error) => {
	logger.error("처리되지 않은 예외 발생", error);
});

process.on("unhandledRejection", (reason: unknown) => {
	logger.error("처리되지 않은 프로미스 거부 발생", reason);
});

// 애플리케이션 시작
main().catch((error: Error) => {
	logger.error("애플리케이션 시작 실패", error);
	process.exit(1);
});
