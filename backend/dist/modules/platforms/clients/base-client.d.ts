import { Logger } from '@nestjs/common';
import { AxiosInstance, AxiosResponse } from 'axios';
import { PlatformApiConfig } from '../config/platform-config';
export interface PlatformToken {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
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
export declare class PlatformApiError extends Error {
    readonly code: number;
    readonly platform: string;
    readonly requestId?: string | undefined;
    readonly retryable: boolean;
    constructor(message: string, code: number, platform: string, requestId?: string | undefined, retryable?: boolean);
}
export declare abstract class BasePlatformClient {
    protected readonly logger: Logger;
    protected readonly http: AxiosInstance;
    protected readonly config: PlatformApiConfig;
    protected readonly platformKey: string;
    private rateLimitBucket;
    protected token: PlatformToken | null;
    protected tokenRefreshPromise: Promise<PlatformToken> | null;
    constructor(platformKey: string, config: PlatformApiConfig);
    setToken(token: PlatformToken): void;
    getToken(): PlatformToken | null;
    isTokenExpired(): boolean;
    protected abstract refreshToken(): Promise<PlatformToken>;
    protected ensureToken(): Promise<PlatformToken>;
    private checkRateLimit;
    protected isRetryable(error: any): boolean;
    protected executeWithRetry<T>(fn: () => Promise<T>, maxRetries?: number): Promise<T>;
    protected get<T = any>(path: string, params?: Record<string, any>): Promise<T>;
    protected post<T = any>(path: string, data?: Record<string, any>): Promise<T>;
    protected extractData<T>(response: AxiosResponse): T;
    protected sleep(ms: number): Promise<void>;
    abstract buildAuthorizeUrl(state: string): string;
    abstract exchangeCode(code: string): Promise<PlatformToken>;
    abstract getUserInfo(): Promise<{
        platformUserId: string;
        nickname: string;
        avatar: string;
        bio?: string;
        followers?: number;
        following?: number;
    }>;
}
