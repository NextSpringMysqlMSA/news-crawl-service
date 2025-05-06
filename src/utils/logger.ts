import path from "node:path";
/**
 * 로깅 유틸리티
 * winston 라이브러리를 사용하여 구조화된 로깅 제공
 */
import winston from "winston";

// 로그 포맷 정의
const logFormat = winston.format.combine(
	winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
	winston.format.errors({ stack: true }),
	winston.format.splat(),
	winston.format.json(),
);

// 콘솔 출력 포맷 정의
const consoleFormat = winston.format.combine(
	winston.format.colorize(),
	winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
	winston.format.printf(({ level, message, timestamp, ...metadata }) => {
		let metaStr = "";
		if (Object.keys(metadata).length > 0 && metadata.stack !== undefined) {
			metaStr = `\n${metadata.stack}`;
		} else if (Object.keys(metadata).length > 0) {
			metaStr = `\n${JSON.stringify(metadata, null, 2)}`;
		}
		return `${timestamp} [${level}]: ${message}${metaStr}`;
	}),
);

// 로그 레벨 정의
const logLevels = {
	error: 0,
	warn: 1,
	info: 2,
	http: 3,
	debug: 4,
};

// 로거 생성 함수
export function createLogger(serviceName: string) {
	return winston.createLogger({
		levels: logLevels,
		format: logFormat,
		defaultMeta: { service: serviceName },
		transports: [
			// 에러 로그 파일 출력 설정
			new winston.transports.File({
				filename: path.join("logs", "error.log"),
				level: "error",
			}),
			// 모든 로그 파일 출력 설정
			new winston.transports.File({
				filename: path.join("logs", "combined.log"),
			}),
			// 콘솔 출력 설정
			new winston.transports.Console({
				format: consoleFormat,
				level: process.env.NODE_ENV === "production" ? "info" : "debug",
			}),
		],
	});
}

// 기본 로거 생성
export const logger = createLogger("news-pick");

// 로그 레벨 타입 정의
export type LogLevel = keyof typeof logLevels;
