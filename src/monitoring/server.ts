import type { Server } from "node:http";
import { env } from "@/config/env";
import { logger } from "@/utils/logger";
/**
 * 모니터링 서버 모듈
 * Prometheus 지표를 HTTP 엔드포인트로 노출합니다.
 */
import express from "express";
import { getMetricsAsString } from "./metrics";

/**
 * 모니터링 서버 클래스
 */
export class MetricsServer {
	private app: express.Application;
	private server: Server | null = null;

	/**
	 * 생성자
	 */
	constructor() {
		this.app = express();
		this.setupRoutes();
	}

	/**
	 * 라우트 설정
	 */
	private setupRoutes(): void {
		this.app.get("/health", (_req, res) => {
			res.status(200).send("OK");
		});

		this.app.get(env.monitoring.path, async (_req, res) => {
			try {
				res.setHeader("Content-Type", "text/plain");
				const metrics = await getMetricsAsString();
				res.end(metrics);
			} catch (error) {
				logger.error("지표 생성 중 오류 발생", error);
				res.status(500).end("지표 생성 중 오류 발생");
			}
		});
	}

	/**
	 * 서버 시작
	 */
	public start(): void {
		if (this.server) {
			logger.warn("지표 서버가 이미 실행 중입니다.");
			return;
		}

		const port = env.monitoring.port;

		this.server = this.app.listen(port, () => {
			logger.info(`Prometheus 지표 서버가 포트 ${port}에서 실행 중입니다.`);
			logger.info(
				`지표 엔드포인트: http://localhost:${port}${env.monitoring.path}`
			);
		});

		this.server.on("error", (error: Error) => {
			logger.error("지표 서버 오류 발생", error);
		});
	}

	/**
	 * 서버 종료
	 */
	public stop(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (!this.server) {
				logger.warn("지표 서버가 실행 중이지 않습니다.");
				resolve();
				return;
			}

			this.server.close((error?: Error) => {
				if (error) {
					logger.error("지표 서버 종료 중 오류 발생", error);
					reject(error);
					return;
				}

				logger.info("지표 서버가 정상적으로 종료되었습니다.");
				this.server = null;
				resolve();
			});
		});
	}
}
