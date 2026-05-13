import { OnModuleDestroy } from '@nestjs/common';
import { Browser, BrowserContext, Page } from 'playwright';
export declare class BrowserPool implements OnModuleDestroy {
    private readonly logger;
    private browser;
    private launching;
    private fingerprintGen;
    private stealthScript;
    getBrowser(retries?: number): Promise<Browser>;
    private loadStealthScript;
    createContext(options?: {
        cookies?: Array<{
            name: string;
            value: string;
            domain: string;
            path: string;
            expires?: number;
            httpOnly?: boolean;
            secure?: boolean;
            sameSite?: 'Strict' | 'Lax' | 'None';
        }>;
        accountId?: string;
        userAgent?: string;
        viewport?: {
            width: number;
            height: number;
        };
    }): Promise<BrowserContext>;
    createPage(context: BrowserContext): Promise<Page>;
    onModuleDestroy(): Promise<void>;
}
