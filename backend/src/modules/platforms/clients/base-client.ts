/**
 * 平台API基础客户端
 * 统一的错误处理、重试、限流、Token刷新
 */

import { Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { PlatformApiConfig } from '../config/platform-config';

// ==================== 类型定义 ====================

export interface PlatformToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp (ms)
  tokenType?: string;
  scope?: string;
}

export interface PlatformApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
  requestId?: string;
  platform: string;
}

export interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
}

export class PlatformApiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly platform: string,
    public readonly requestId?: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'PlatformApiError';
  }
}

// ==================== 基础客户端 ====================

export abstract class BasePlatformClient {
  protected readonly logger: Logger;
  protected readonly http: AxiosInstance;
  protected readonly config: PlatformApiConfig;
  protected readonly platformKey: string;

  // 限流器
  private rateLimitBucket: RateLimitBucket;

  // Token管理
  protected token: PlatformToken | null = null;
  protected tokenRefreshPromise: Promise<PlatformToken> | null = null;

  constructor(platformKey: string, config: PlatformApiConfig) {
    this.platformKey = platformKey;
    this.config = config;
    this.logger = new Logger(`${platformKey}Client`);

    // 初始化限流桶
    this.rateLimitBucket = {
      tokens: config.rateLimit.maxRequests,
      lastRefill: Date.now(),
    };

    // 创建HTTP客户端
    this.http = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MatrixFlow-ERP/1.0',
      },
    });

    // 请求拦截器：注入Token
    this.http.interceptors.request.use((cfg) => {
      if (this.token?.accessToken) {
        cfg.headers.Authorization = `Bearer ${this.token.accessToken}`;
      }
      return cfg;
    });

    // 响应拦截器：统一错误处理
    this.http.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401 && this.token?.refreshToken) {
          try {
            await this.refreshToken();
            return this.http.request(error.config!);
          } catch (refreshError) {
            this.logger.error('Token刷新失败', refreshError);
          }
        }
        return Promise.reject(error);
      },
    );
  }

  // ==================== Token管理 ====================

  /**
   * 设置当前Token
   */
  setToken(token: PlatformToken): void {
    this.token = token;
  }

  /**
   * 获取当前Token
   */
  getToken(): PlatformToken | null {
    return this.token;
  }

  /**
   * 检查Token是否过期
   */
  isTokenExpired(): boolean {
    if (!this.token) return true;
    // 提前5分钟视为过期
    return Date.now() >= this.token.expiresAt - 5 * 60 * 1000;
  }

  /**
   * 刷新Token — 子类实现
   */
  protected abstract refreshToken(): Promise<PlatformToken>;

  /**
   * 确保Token有效
   */
  protected async ensureToken(): Promise<PlatformToken> {
    if (!this.token) {
      throw new PlatformApiError(
        '未设置Token，请先完成OAuth授权',
        401,
        this.platformKey,
      );
    }

    if (this.isTokenExpired()) {
      if (this.tokenRefreshPromise) {
        return this.tokenRefreshPromise;
      }

      this.tokenRefreshPromise = this.refreshToken();
      try {
        const newToken = await this.tokenRefreshPromise;
        return newToken;
      } finally {
        this.tokenRefreshPromise = null;
      }
    }

    return this.token;
  }

  // ==================== 限流 ====================

  /**
   * 令牌桶限流检查
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.rateLimitBucket.lastRefill;
    const refillRate = this.config.rateLimit.maxRequests / this.config.rateLimit.windowMs;

    // 补充令牌
    this.rateLimitBucket.tokens = Math.min(
      this.config.rateLimit.maxRequests,
      this.rateLimitBucket.tokens + elapsed * refillRate,
    );
    this.rateLimitBucket.lastRefill = now;

    // 等待令牌可用
    if (this.rateLimitBucket.tokens < 1) {
      const waitTime = (1 - this.rateLimitBucket.tokens) / refillRate;
      this.logger.debug(`限流等待: ${Math.ceil(waitTime)}ms`);
      await this.sleep(waitTime);
      this.rateLimitBucket.tokens = 1;
    }

    this.rateLimitBucket.tokens -= 1;
  }

  // ==================== 重试 ====================

  /**
   * 判断错误是否可重试
   */
  protected isRetryable(error: any): boolean {
    if (error instanceof PlatformApiError) {
      return error.retryable;
    }

    // 网络错误可重试
    if (axios.isAxiosError(error)) {
      if (!error.response) return true; // 网络超时
      const status = error.response.status;
      // 429(限流)、500/502/503/504(服务端错误)可重试
      return status === 429 || status >= 500;
    }

    return false;
  }

  /**
   * 带重试的请求执行
   */
  protected async executeWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries?: number,
  ): Promise<T> {
    const retries = maxRetries ?? this.config.retry.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.checkRateLimit();
        await this.ensureToken();
        return await fn();
      } catch (error: any) {
        lastError = error;

        if (attempt === retries || !this.isRetryable(error)) {
          break;
        }

        // 指数退避
        const delay = Math.min(
          this.config.retry.baseDelay * Math.pow(2, attempt),
          this.config.retry.maxDelay,
        );
        const jitter = delay * 0.2 * Math.random();
        this.logger.warn(
          `请求失败，${attempt + 1}/${retries} 次重试，等待 ${Math.ceil(delay + jitter)}ms`,
        );
        await this.sleep(delay + jitter);
      }
    }

    throw lastError || new PlatformApiError('请求失败', 500, this.platformKey);
  }

  // ==================== HTTP方法封装 ====================

  protected async get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
    return this.executeWithRetry(async () => {
      const response = await this.http.get<T>(path, { params });
      return this.extractData(response);
    });
  }

  protected async post<T = any>(path: string, data?: Record<string, any>): Promise<T> {
    return this.executeWithRetry(async () => {
      const response = await this.http.post<T>(path, data);
      return this.extractData(response);
    });
  }

  /**
   * 提取响应数据 — 子类可覆盖以适配不同平台的响应格式
   */
  protected extractData<T>(response: AxiosResponse): T {
    return response.data as T;
  }

  // ==================== 工具方法 ====================

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 构建授权URL
   */
  abstract buildAuthorizeUrl(state: string): string;

  /**
   * 用授权码换取Token
   */
  abstract exchangeCode(code: string): Promise<PlatformToken>;

  /**
   * 获取用户信息
   */
  abstract getUserInfo(): Promise<{
    platformUserId: string;
    nickname: string;
    avatar: string;
    bio?: string;
    followers?: number;
    following?: number;
  }>;
}
