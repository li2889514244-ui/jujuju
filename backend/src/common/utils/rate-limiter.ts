/**
 * 请求频率限制和随机延迟工具
 * 防止 API 调用过于频繁导致账号被封
 */

import { Logger } from '@nestjs/common';

export interface RateLimitConfig {
  // 每秒最大请求数
  maxRequestsPerSecond: number;
  // 每分钟最大请求数
  maxRequestsPerMinute: number;
  // 基础延迟（毫秒）
  baseDelay: number;
  // 随机延迟范围（毫秒）
  randomDelayRange: number;
}

export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);
  private requestTimestamps: number[] = [];
  private lastRequestTime = 0;

  constructor(private readonly config: RateLimitConfig) {}

  /**
   * 执行频率限制和延迟
   */
  async throttle(): Promise<void> {
    const now = Date.now();

    // 1. 清理过期的请求记录（超过1分钟的）
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < 60000,
    );

    // 2. 检查每分钟限制
    if (this.requestTimestamps.length >= this.config.maxRequestsPerMinute) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = 60000 - (now - oldestTimestamp);
      if (waitTime > 0) {
        this.logger.warn(`达到每分钟请求限制，等待 ${waitTime}ms`);
        await this.sleep(waitTime);
      }
    }

    // 3. 检查每秒限制
    const recentRequests = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < 1000,
    );
    if (recentRequests.length >= this.config.maxRequestsPerSecond) {
      const waitTime = 1000 - (now - recentRequests[0]);
      if (waitTime > 0) {
        await this.sleep(waitTime);
      }
    }

    // 4. 添加随机延迟（模拟人类行为）
    const randomDelay = Math.floor(Math.random() * this.config.randomDelayRange);
    const totalDelay = this.config.baseDelay + randomDelay;

    // 5. 确保两次请求之间至少有一定间隔
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < totalDelay) {
      await this.sleep(totalDelay - timeSinceLastRequest);
    }

    // 6. 记录本次请求
    this.requestTimestamps.push(Date.now());
    this.lastRequestTime = Date.now();
  }

  /**
   * 带重试的请求包装器
   */
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: {
      maxRetries?: number;
      retryDelay?: number;
      shouldRetry?: (error: any) => boolean;
    } = {},
  ): Promise<T> {
    const { maxRetries = 3, retryDelay = 5000, shouldRetry } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 先执行频率限制
        await this.throttle();

        const result = await fn();
        return result;
      } catch (error) {
        const isRetryable = shouldRetry ? shouldRetry(error) : this.isRetryableError(error);

        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        this.logger.warn(`请求失败，${retryDelay}ms 后重试 (${attempt}/${maxRetries})`);
        await this.sleep(retryDelay * attempt); // 指数退避
      }
    }

    throw new Error('重试次数耗尽');
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryableError(error: any): boolean {
    // 网络错误
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // HTTP 429 (Too Many Requests)
    if (error.response?.status === 429) {
      return true;
    }

    // HTTP 5xx 服务器错误
    if (error.response?.status >= 500) {
      return true;
    }

    // 抖音/平台特定的限流错误
    const errorMessage = error.message || '';
    if (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('frequency') ||
      errorMessage.includes('频繁') ||
      errorMessage.includes('限制')
    ) {
      return true;
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 平台特定的频率限制配置
export const platformRateLimits: Record<string, RateLimitConfig> = {
  // 抖音 - 较严格
  douyin: {
    maxRequestsPerSecond: 2,
    maxRequestsPerMinute: 30,
    baseDelay: 2000,
    randomDelayRange: 1000,
  },
  // 视频号 - 中等
  wechat_video: {
    maxRequestsPerSecond: 3,
    maxRequestsPerMinute: 50,
    baseDelay: 1500,
    randomDelayRange: 800,
  },
  // 小红书 - 较宽松
  xiaohongshu: {
    maxRequestsPerSecond: 5,
    maxRequestsPerMinute: 100,
    baseDelay: 1000,
    randomDelayRange: 500,
  },
  // 快手 - 中等
  kuaishou: {
    maxRequestsPerSecond: 3,
    maxRequestsPerMinute: 60,
    baseDelay: 1200,
    randomDelayRange: 600,
  },
};
