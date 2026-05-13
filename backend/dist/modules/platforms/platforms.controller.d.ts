import { PlatformsService } from './platforms.service';
import { OAuthService } from './oauth/oauth.service';
import { AuthorizePlatformDto, CollectDataDto, BatchCollectDto, PlatformFilterDto } from './dto/platform.dto';
export declare class PlatformsController {
    private readonly platformsService;
    private readonly oauthService;
    constructor(platformsService: PlatformsService, oauthService: OAuthService);
    getSupportedPlatforms(): Promise<{
        key: string;
        name: string;
        oauthUrl: string;
        scopes: string[];
    }[]>;
    getPlatformInfo(platform: string): Promise<{
        key: string;
        name: string;
        scopes: string[];
        rateLimit: {
            maxRequests: number;
            windowMs: number;
        };
    }>;
    getAuthorizeUrl(dto: AuthorizePlatformDto, userId: string): Promise<{
        url: Promise<string>;
        platform: string;
    }>;
    revokeAuthorization(accountId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    getAuthorizedAccounts(filter: PlatformFilterDto, userId: string): Promise<{
        accounts: any[];
        total: number;
        skip: number;
        take: number;
    }>;
    collectAccountData(dto: CollectDataDto): Promise<import("./collectors/data-collector.interface").CollectorResult<import("./collectors/data-collector.interface").AccountMetrics> | import("./collectors/data-collector.interface").CollectorResult<import("./collectors/data-collector.interface").ContentMetrics[]> | import("./collectors/data-collector.interface").CollectorResult<import("./collectors/data-collector.interface").DailyMetrics>>;
    batchCollectData(dto: BatchCollectDto): Promise<{
        total: number;
        success: number;
        failed: number;
        results: {
            accountId: string;
            success: boolean;
            error?: string;
        }[];
    }>;
    refreshToken(accountId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    refreshExpiringTokens(): Promise<{
        refreshed: number;
        failed: number;
    }>;
}
