import { PrismaService } from '../../../prisma/prisma.service';
import { OAuthService } from '../oauth/oauth.service';
import { IDataCollector, AccountMetrics, ContentMetrics, DailyMetrics, CollectorResult } from './data-collector.interface';
export declare class DouyinCollector implements IDataCollector {
    private prisma;
    private oauthService;
    readonly platform = "DOUYIN";
    private readonly logger;
    constructor(prisma: PrismaService, oauthService: OAuthService);
    private getClient;
    collectAccountMetrics(accountId: string): Promise<CollectorResult<AccountMetrics>>;
    collectContentMetrics(accountId: string, options?: {
        cursor?: string;
        limit?: number;
    }): Promise<CollectorResult<ContentMetrics[]>>;
    collectDailyMetrics(accountId: string): Promise<CollectorResult<DailyMetrics>>;
}
