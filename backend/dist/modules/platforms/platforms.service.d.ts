import { PrismaService } from '../../prisma/prisma.service';
import { OAuthService } from './oauth/oauth.service';
import { ReportMetricsDto, ReportPostStatsDto } from './dto/platform.dto';
import { DouyinCollector } from './collectors/douyin.collector';
import { KuaishouCollector } from './collectors/kuaishou.collector';
import { XiaohongshuCollector } from './collectors/xiaohongshu.collector';
import { ShipinhaoCollector } from './collectors/shipinhao.collector';
import { BilibiliCollector } from './collectors/bilibili.collector';
import { WeiboCollector } from './collectors/weibo.collector';
export declare class PlatformsService {
    private prisma;
    private oauthService;
    private readonly logger;
    private readonly collectors;
    constructor(prisma: PrismaService, oauthService: OAuthService, douyinCollector: DouyinCollector, kuaishouCollector: KuaishouCollector, xiaohongshuCollector: XiaohongshuCollector, shipinhaoCollector: ShipinhaoCollector, bilibiliCollector: BilibiliCollector, weiboCollector: WeiboCollector);
    getSupportedPlatforms(): {
        key: string;
        name: string;
        oauthUrl: string;
        scopes: string[];
    }[];
    getPlatformInfo(platform: string): {
        key: string;
        name: string;
        scopes: string[];
        rateLimit: {
            maxRequests: number;
            windowMs: number;
        };
    };
    getAuthorizeUrl(platform: string, userId: string, teamId?: string): Promise<string>;
    revokeAuthorization(accountId: string, userId: string): Promise<void>;
    private getCollector;
    collectAccountData(accountId: string, type?: 'account' | 'content' | 'daily'): Promise<import("./collectors/data-collector.interface").CollectorResult<import("./collectors/data-collector.interface").AccountMetrics> | import("./collectors/data-collector.interface").CollectorResult<import("./collectors/data-collector.interface").ContentMetrics[]> | import("./collectors/data-collector.interface").CollectorResult<import("./collectors/data-collector.interface").DailyMetrics>>;
    batchCollectData(accountIds: string[], type?: 'account' | 'content' | 'daily'): Promise<{
        total: number;
        success: number;
        failed: number;
        results: {
            accountId: string;
            success: boolean;
            error?: string;
        }[];
    }>;
    reportMetrics(dto: ReportMetricsDto): Promise<{
        success: boolean;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
    }>;
    reportPostStats(dto: ReportPostStatsDto): Promise<{
        success: boolean;
        error: string;
        created?: undefined;
        updated?: undefined;
        total?: undefined;
    } | {
        success: boolean;
        created: number;
        updated: number;
        total: number;
        error?: undefined;
    }>;
    refreshToken(accountId: string): Promise<boolean>;
    refreshExpiringTokens(): Promise<{
        refreshed: number;
        failed: number;
    }>;
    getAuthorizedAccounts(params: {
        userId?: string;
        teamId?: string;
        platform?: string;
        skip?: number;
        take?: number;
    }): Promise<{
        accounts: any[];
        total: number;
        skip: number;
        take: number;
    }>;
}
