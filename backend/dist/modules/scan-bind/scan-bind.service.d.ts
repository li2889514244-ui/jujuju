import { BrowserPool } from '../uploader/browser-pool';
import { PrismaService } from '../../prisma/prisma.service';
import { BrowserContext, Page } from 'playwright';
interface ScanSession {
    clientId: string;
    platform: string;
    userId: string;
    context?: BrowserContext;
    page?: Page;
    timer?: NodeJS.Timeout;
    cancelled: boolean;
    onQrCode: (imageBase64: string) => void;
    onStatus: (status: string, message?: string) => void;
    onSuccess: (accountData: any) => void;
    onError: (error: string) => void;
}
export declare class ScanBindService {
    private browserPool;
    private prisma;
    private readonly logger;
    private sessions;
    constructor(browserPool: BrowserPool, prisma: PrismaService);
    startScanSession(params: Omit<ScanSession, 'cancelled' | 'context' | 'page' | 'timer'>): Promise<void>;
    private pollQrCodeAndStatus;
    private extractAccountInfo;
    private saveAccount;
    cancelSession(clientId: string): void;
    private cleanup;
}
export {};
