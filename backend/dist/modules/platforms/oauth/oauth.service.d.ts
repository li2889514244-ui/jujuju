import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { BasePlatformClient } from '../clients/base-client';
export interface OAuthState {
    userId: string;
    teamId?: string;
    platform: string;
    nonce: string;
    timestamp: number;
}
export interface TokenData {
    accessToken: string;
    refreshToken?: string;
    expiresAt: Date;
    scope?: string;
}
export declare class OAuthService {
    private prisma;
    private configService;
    private redis;
    private readonly logger;
    private readonly encryptionKey;
    private readonly clientCache;
    private readonly stateStoreFallback;
    constructor(prisma: PrismaService, configService: ConfigService, redis: RedisService);
    getClient(platform: string): BasePlatformClient;
    private stateRedisKey;
    private storeState;
    private retrieveState;
    private deleteState;
    buildAuthorizeUrl(platform: string, userId: string, teamId?: string): Promise<string>;
    handleCallback(code: string, state: string): Promise<{
        success: boolean;
        accountId?: string;
        platform?: string;
        message: string;
    }>;
    refreshAccountToken(accountId: string): Promise<boolean>;
    refreshExpiringTokens(): Promise<{
        refreshed: number;
        failed: number;
    }>;
    private encryptToken;
    private decryptToken;
}
