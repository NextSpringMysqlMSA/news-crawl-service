import { env } from "@/config/env";
import type { RetryOptions } from "@/crawlers/base-crawler";
import { CrawlerCluster } from "@/crawlers/crawler-cluster";
/**
 * 서비스 컨테이너 모듈
 * 애플리케이션의 의존성 주입을 관리합니다.
 */
import { CrawlerRegistry } from "@/crawlers/crawler-registry";
import { CrawlerService } from "@/crawlers/crawler-service";
import { registerAllPlugins } from "@/plugins/register-plugins";
import { KafkaConsumerService } from "@/services/kafka-consumer";
import { KafkaProducerService } from "@/services/kafka-producer";
import { logger } from "@/utils/logger";

/**
 * 서비스 컨테이너 옵션 인터페이스
 */
export interface ServiceContainerOptions {
	retryOptions?: Partial<RetryOptions>;
	concurrentLimit?: number;
}

/**
 * 서비스 컨테이너 클래스
 * 애플리케이션에서 사용되는 서비스 인스턴스를 생성하고 관리합니다.
 */
export class ServiceContainer {
	private static instance: ServiceContainer;
	private services: Map<string, unknown> = new Map();
	private options: ServiceContainerOptions;

	/**
	 * 싱글톤 인스턴스 접근자
	 * @param options - 서비스 컨테이너 옵션
	 * @returns ServiceContainer 싱글톤 인스턴스
	 */
	public static getInstance(
		options?: ServiceContainerOptions,
	): ServiceContainer {
		if (!ServiceContainer.instance) {
			ServiceContainer.instance = new ServiceContainer(options || {});
		}

		return ServiceContainer.instance;
	}

	/**
	 * 생성자 (private으로 외부에서 직접 인스턴스화 방지)
	 * @param options - 서비스 컨테이너 옵션
	 */
	private constructor(options: ServiceContainerOptions) {
		this.options = options;
		logger.debug("서비스 컨테이너 인스턴스 생성됨");
	}

	/**
	 * 크롤러 레지스트리 가져오기
	 * @returns 크롤러 레지스트리 인스턴스
	 */
	public getCrawlerRegistry(): CrawlerRegistry {
		const serviceKey = "crawlerRegistry";

		if (!this.services.has(serviceKey)) {
			const registry = CrawlerRegistry.getInstance();
			registerAllPlugins(registry);
			this.services.set(serviceKey, registry);
		}

		return this.services.get(serviceKey) as CrawlerRegistry;
	}

	/**
	 * 크롤러 클러스터 가져오기
	 * @returns 크롤러 클러스터 인스턴스
	 */
	public getCrawlerCluster(): CrawlerCluster {
		const serviceKey = "crawlerCluster";

		if (!this.services.has(serviceKey)) {
			const registry = this.getCrawlerRegistry();
			const cluster = new CrawlerCluster(registry, this.options.retryOptions);
			this.services.set(serviceKey, cluster);
		}

		return this.services.get(serviceKey) as CrawlerCluster;
	}

	/**
	 * 크롤러 서비스 가져오기
	 * @returns 크롤러 서비스 인스턴스
	 */
	public getCrawlerService(): CrawlerService {
		const serviceKey = "crawlerService";

		if (!this.services.has(serviceKey)) {
			const registry = this.getCrawlerRegistry();
			const cluster = this.getCrawlerCluster();

			const service = new CrawlerService(
				registry,
				cluster,
				this.options.retryOptions,
			);

			// 동시성 제한 설정 (옵션으로 제공된 경우)
			if (this.options.concurrentLimit) {
				service.setConcurrentLimit(this.options.concurrentLimit);
			}

			// 이벤트 리스너 설정
			service.on(CrawlerService.EVENTS.INITIALIZED, () => {
				logger.info("크롤러 서비스 초기화 이벤트 감지됨");
			});

			service.on(CrawlerService.EVENTS.CLOSED, () => {
				logger.info("크롤러 서비스 종료 이벤트 감지됨");
			});

			this.services.set(serviceKey, service);
		}

		return this.services.get(serviceKey) as CrawlerService;
	}

	/**
	 * Kafka 프로듀서 서비스 가져오기
	 * @returns Kafka 프로듀서 서비스 인스턴스
	 */
	public getKafkaProducerService(): KafkaProducerService {
		const serviceKey = "kafkaProducerService";

		if (!this.services.has(serviceKey)) {
			this.services.set(
				serviceKey,
				new KafkaProducerService(env.kafka.resultTopic),
			);
		}

		return this.services.get(serviceKey) as KafkaProducerService;
	}

	/**
	 * Kafka 소비자 서비스 가져오기
	 * @returns Kafka 소비자 서비스 인스턴스
	 */
	public getKafkaConsumerService(): KafkaConsumerService {
		const serviceKey = "kafkaConsumerService";

		if (!this.services.has(serviceKey)) {
			const crawlerService = this.getCrawlerService();
			const producerService = this.getKafkaProducerService();

			this.services.set(
				serviceKey,
				new KafkaConsumerService(crawlerService, producerService),
			);
		}

		return this.services.get(serviceKey) as KafkaConsumerService;
	}

	/**
	 * 컨테이너에 서비스 등록
	 * @param key - 서비스 키
	 * @param service - 서비스 인스턴스
	 */
	public register<T>(key: string, service: T): void {
		this.services.set(key, service);
		logger.debug(`서비스 등록됨: ${key}`);
	}

	/**
	 * 컨테이너에서 서비스 가져오기
	 * @param key - 서비스 키
	 * @returns 서비스 인스턴스 또는 undefined
	 */
	public get<T>(key: string): T | undefined {
		return this.services.get(key) as T | undefined;
	}

	/**
	 * 컨테이너 초기화
	 * 모든 서비스를 초기화합니다.
	 */
	public async initialize(): Promise<void> {
		logger.info("서비스 컨테이너 초기화 중...");

		// 크롤러 서비스 초기화
		const crawlerService = this.getCrawlerService();
		await crawlerService.initialize();

		// Kafka 프로듀서 초기화
		const producerService = this.getKafkaProducerService();
		try {
			await producerService.connect();
		} catch (error) {
			logger.warn("Kafka 프로듀서 연결 실패, 로컬 로깅으로 계속됩니다", error);
		}

		logger.info("서비스 컨테이너 초기화 완료");
	}

	/**
	 * 컨테이너 종료
	 * 모든 서비스를 종료합니다.
	 */
	public async close(): Promise<void> {
		logger.info("서비스 컨테이너 종료 중...");

		// 크롤러 서비스 종료
		const crawlerService = this.getCrawlerService();
		await crawlerService.close();

		// Kafka 프로듀서 종료
		const producerService = this.getKafkaProducerService();
		await producerService.disconnect();

		logger.info("서비스 컨테이너 종료 완료");
	}
}
