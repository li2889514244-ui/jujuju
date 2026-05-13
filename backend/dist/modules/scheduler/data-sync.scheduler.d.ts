import { PrismaService } from '../../prisma/prisma.service';
import { BrowserPool } from '../uploader/browser-pool';
import { CookieManager } from '../uploader/cookie-manager';
export declare class DataSyncScheduler {
    private prisma;
    private browserPool;
    private cookieManager;
    private readonly logger;
    private isRunning;
    constructor(prisma: PrismaService, browserPool: BrowserPool, cookieManager: CookieManager);
    handleDailySync(): Promise<void>;
    private collectMetrics;
    private collectDouyin;
    private collectXiaohongshu;
    private collectKuaishou;
    private collectBilibili;
    private collectWeibo;
    private collectWechatVideo;
    private extractNumber;
    private parseChineseNumber;
    private saveMetrics;
    private delay;
}
