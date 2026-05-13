import { PrismaService } from '../../prisma/prisma.service';
import { StoredCookie } from './base-uploader';
import { ConfigService } from '@nestjs/config';
export declare class CookieManager {
    private prisma;
    private config;
    private readonly logger;
    private readonly algorithm;
    private encryptionKey;
    constructor(prisma: PrismaService, config: ConfigService);
    private encrypt;
    private decrypt;
    saveCookies(accountId: string, cookies: StoredCookie[]): Promise<void>;
    loadCookies(accountId: string): Promise<StoredCookie[] | null>;
    decryptCookie(encrypted: string): StoredCookie[];
    clearCookies(accountId: string): Promise<void>;
}
