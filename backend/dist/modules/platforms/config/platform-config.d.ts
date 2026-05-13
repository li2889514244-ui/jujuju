export interface PlatformOAuthConfig {
    clientId: string;
    clientSecret: string;
    authorizeUrl: string;
    tokenUrl: string;
    refreshTokenUrl: string;
    callbackUrl: string;
    scopes: string[];
}
export interface PlatformApiConfig {
    baseUrl: string;
    version: string;
    timeout: number;
    rateLimit: {
        maxRequests: number;
        windowMs: number;
    };
    retry: {
        maxRetries: number;
        baseDelay: number;
        maxDelay: number;
    };
}
export interface PlatformConfig {
    name: string;
    key: string;
    oauth: PlatformOAuthConfig;
    api: PlatformApiConfig;
}
export declare const DOUYIN_CONFIG: PlatformConfig;
export declare const KUAISHOU_CONFIG: PlatformConfig;
export declare const XIAOHONGSHU_CONFIG: PlatformConfig;
export declare const SHIPINHAO_CONFIG: PlatformConfig;
export declare const BILIBILI_CONFIG: PlatformConfig;
export declare const WEIBO_CONFIG: PlatformConfig;
export declare const PLATFORM_CONFIGS: Record<string, PlatformConfig>;
export declare function getPlatformConfig(platform: string): PlatformConfig;
