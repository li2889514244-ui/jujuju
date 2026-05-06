import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * 全局 Redis 服务
 * - 如果 REDIS_HOST 未配置或连接失败，自动 fallback 到内存存储并打 warn 日志
 * - 提供 get/set/del/setWithTTL 等通用方法
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private memoryFallback = new Map<string, { value: string; expiresAt?: number }>();
  private useMemory = false;

  constructor(private configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST');
    const redisUrl = this.configService.get<string>('REDIS_URL');

    // Railway 等平台通过 REDIS_URL 提供连接字符串，优先解析
    if (!host && redisUrl) {
      try {
        const parsed = new URL(redisUrl);
        this.logger.log(`从 REDIS_URL 解析连接: ${parsed.hostname}:${parsed.port}`);
        this.client = new Redis({
          host: parsed.hostname,
          port: parseInt(parsed.port || '6379', 10),
          password: parsed.password || undefined,
          db: parseInt(parsed.pathname?.replace('/', '') || '0', 10),
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            if (times > 3) {
              this.logger.error('Redis 连接失败超过 3 次，切换到内存 fallback');
              this.useMemory = true;
              return null;
            }
            return Math.min(times * 200, 2000);
          },
        });
        this.setupEventListeners();
        return;
      } catch (err: any) {
        this.logger.warn(`REDIS_URL 解析失败: ${err.message}，尝试 REDIS_HOST`);
      }
    }

    if (!host) {
      this.logger.warn('REDIS_HOST 未配置，Redis 服务将使用内存 fallback（不适用于生产环境）');
      this.useMemory = true;
      return;
    }

    try {
      this.client = new Redis({
        host,
        port: this.configService.get<number>('REDIS_PORT', 6379),
        password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
        db: this.configService.get<number>('REDIS_DB', 0),
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.logger.error('Redis 连接失败超过 3 次，切换到内存 fallback');
            this.useMemory = true;
            return null;
          }
          return Math.min(times * 200, 2000);
        },
      });
      this.setupEventListeners();
    } catch (err: any) {
      this.logger.warn(`Redis 初始化失败: ${err.message}，使用内存 fallback`);
      this.useMemory = true;
    }
  }

  private setupEventListeners() {
    if (!this.client) return;
    this.client.on('error', (err) => {
      this.logger.warn(`Redis 连接错误: ${err.message}，部分功能将使用内存 fallback`);
      this.useMemory = true;
    });
    this.client.on('connect', () => {
      this.logger.log('Redis 连接成功');
      this.useMemory = false;
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.useMemory || !this.client) {
      const entry = this.memoryFallback.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.memoryFallback.delete(key);
        return null;
      }
      return entry.value;
    }
    return this.client.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    if (this.useMemory || !this.client) {
      this.memoryFallback.set(key, { value });
      return;
    }
    await this.client.set(key, value);
  }

  async setWithTTL(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.useMemory || !this.client) {
      this.memoryFallback.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return;
    }
    await this.client.set(key, value, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    if (this.useMemory || !this.client) {
      this.memoryFallback.delete(key);
      return;
    }
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    if (this.useMemory || !this.client) {
      const entry = this.memoryFallback.get(key);
      if (!entry) return false;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        this.memoryFallback.delete(key);
        return false;
      }
      return true;
    }
    const result = await this.client.exists(key);
    return result === 1;
  }
}
