"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var OAuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto = require("crypto");
const prisma_service_1 = require("../../../prisma/prisma.service");
const redis_service_1 = require("../../../redis/redis.service");
const douyin_client_1 = require("../clients/douyin.client");
const kuaishou_client_1 = require("../clients/kuaishou.client");
const xiaohongshu_client_1 = require("../clients/xiaohongshu.client");
const shipinhao_client_1 = require("../clients/shipinhao.client");
const bilibili_client_1 = require("../clients/bilibili.client");
const weibo_client_1 = require("../clients/weibo.client");
const platform_config_1 = require("../config/platform-config");
const OAUTH_STATE_TTL = 300;
let OAuthService = OAuthService_1 = class OAuthService {
    constructor(prisma, configService, redis) {
        this.prisma = prisma;
        this.configService = configService;
        this.redis = redis;
        this.logger = new common_1.Logger(OAuthService_1.name);
        this.clientCache = new Map();
        this.stateStoreFallback = new Map();
        const tokenKey = this.configService.get('TOKEN_ENCRYPTION_KEY');
        if (!tokenKey || tokenKey.length < 32) {
            throw new Error('FATAL: TOKEN_ENCRYPTION_KEY environment variable is required and must be at least 32 characters.');
        }
        this.encryptionKey = tokenKey;
    }
    getClient(platform) {
        if (this.clientCache.has(platform)) {
            return this.clientCache.get(platform);
        }
        const clientMap = {
            DOUYIN: () => new douyin_client_1.DouyinClient(),
            KUAISHOU: () => new kuaishou_client_1.KuaishouClient(),
            XIAOHONGSHU: () => new xiaohongshu_client_1.XiaohongshuClient(),
            WECHAT_VIDEO: () => new shipinhao_client_1.ShipinhaoClient(),
            BILIBILI: () => new bilibili_client_1.BilibiliClient(),
            WEIBO: () => new weibo_client_1.WeiboClient(),
        };
        const factory = clientMap[platform];
        if (!factory) {
            throw new common_1.BadRequestException(`不支持的平台: ${platform}`);
        }
        const client = factory();
        this.clientCache.set(platform, client);
        return client;
    }
    stateRedisKey(nonce) {
        return `oauth:state:${nonce}`;
    }
    async storeState(nonce, state) {
        try {
            await this.redis.setWithTTL(this.stateRedisKey(nonce), JSON.stringify(state), OAUTH_STATE_TTL);
        }
        catch {
            this.logger.warn('Redis 存储 OAuth state 失败，fallback 到内存存储');
            this.stateStoreFallback.set(nonce, state);
        }
    }
    async retrieveState(nonce) {
        try {
            const raw = await this.redis.get(this.stateRedisKey(nonce));
            if (raw)
                return JSON.parse(raw);
        }
        catch {
            this.logger.warn('Redis 读取 OAuth state 失败，尝试内存 fallback');
        }
        return this.stateStoreFallback.get(nonce) ?? null;
    }
    async deleteState(nonce) {
        try {
            await this.redis.del(this.stateRedisKey(nonce));
        }
        catch {
        }
        this.stateStoreFallback.delete(nonce);
    }
    async buildAuthorizeUrl(platform, userId, teamId) {
        const nonce = crypto.randomBytes(16).toString('hex');
        const state = {
            userId,
            teamId,
            platform,
            nonce,
            timestamp: Date.now(),
        };
        const stateStr = Buffer.from(JSON.stringify(state)).toString('base64url');
        await this.storeState(nonce, state);
        const client = this.getClient(platform);
        return client.buildAuthorizeUrl(stateStr);
    }
    async handleCallback(code, state) {
        let stateData;
        try {
            const decoded = Buffer.from(state, 'base64url').toString('utf8');
            stateData = JSON.parse(decoded);
        }
        catch {
            throw new common_1.BadRequestException('无效的OAuth state参数');
        }
        const storedState = await this.retrieveState(stateData.nonce);
        if (!storedState) {
            throw new common_1.BadRequestException('OAuth state已过期或无效');
        }
        if (Date.now() - stateData.timestamp > OAUTH_STATE_TTL * 1000) {
            await this.deleteState(stateData.nonce);
            throw new common_1.BadRequestException('OAuth state已过期');
        }
        await this.deleteState(stateData.nonce);
        const { platform, userId, teamId } = stateData;
        try {
            const client = this.getClient(platform);
            const token = await client.exchangeCode(code);
            const userInfo = await client.getUserInfo();
            const encryptedToken = this.encryptToken(token);
            const account = await this.prisma.account.upsert({
                where: {
                    platform_platformUserId: {
                        platform: platform,
                        platformUserId: userInfo.platformUserId,
                    },
                },
                update: {
                    nickname: userInfo.nickname,
                    avatar: userInfo.avatar,
                    bio: userInfo.bio,
                    followers: userInfo.followers || 0,
                    following: userInfo.following || 0,
                    metadata: JSON.stringify({
                        oauthToken: encryptedToken,
                        tokenExpiresAt: new Date(token.expiresAt).toISOString(),
                        scope: token.scope,
                    }),
                },
                create: {
                    platform: platform,
                    platformUserId: userInfo.platformUserId,
                    nickname: userInfo.nickname,
                    avatar: userInfo.avatar,
                    bio: userInfo.bio,
                    followers: userInfo.followers || 0,
                    following: userInfo.following || 0,
                    userId,
                    teamId,
                    metadata: JSON.stringify({
                        oauthToken: encryptedToken,
                        tokenExpiresAt: new Date(token.expiresAt).toISOString(),
                        scope: token.scope,
                    }),
                },
            });
            this.logger.log(`OAuth授权成功: ${platform} - ${userInfo.nickname} (${account.id})`);
            return {
                success: true,
                accountId: account.id,
                platform,
                message: `${(0, platform_config_1.getPlatformConfig)(platform).name}授权成功`,
            };
        }
        catch (error) {
            this.logger.error(`OAuth授权失败: ${platform}`, error);
            return {
                success: false,
                platform,
                message: `授权失败: ${error.message}`,
            };
        }
    }
    async refreshAccountToken(accountId) {
        const account = await this.prisma.account.findUnique({
            where: { id: accountId },
        });
        if (!account) {
            throw new common_1.BadRequestException('账号不存在');
        }
        const metadata = (account.metadata ? JSON.parse(account.metadata) : {});
        if (!metadata?.oauthToken) {
            this.logger.warn(`账号 ${accountId} 无OAuth Token`);
            return false;
        }
        try {
            const client = this.getClient(account.platform);
            const token = this.decryptToken(metadata.oauthToken);
            client.setToken(token);
            const userInfo = await client.getUserInfo();
            const newToken = client.getToken();
            const encryptedToken = this.encryptToken(newToken);
            await this.prisma.account.update({
                where: { id: accountId },
                data: {
                    metadata: JSON.stringify({
                        ...metadata,
                        oauthToken: encryptedToken,
                        tokenExpiresAt: new Date(newToken.expiresAt).toISOString(),
                    }),
                    lastActiveAt: new Date(),
                },
            });
            this.logger.log(`Token刷新成功: ${account.platform} - ${account.nickname}`);
            return true;
        }
        catch (error) {
            this.logger.error(`Token刷新失败: ${accountId}`, error);
            return false;
        }
    }
    async refreshExpiringTokens() {
        const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        const accounts = await this.prisma.account.findMany({
            where: {
                status: 'ACTIVE',
                metadata: { not: null },
            },
        });
        const expiringAccounts = accounts.filter((a) => {
            try {
                const md = JSON.parse(a.metadata || '{}');
                return md.tokenExpiresAt && new Date(md.tokenExpiresAt) <= threeDaysFromNow;
            }
            catch {
                return false;
            }
        });
        let refreshed = 0;
        let failed = 0;
        for (const account of expiringAccounts) {
            try {
                const success = await this.refreshAccountToken(account.id);
                if (success)
                    refreshed++;
                else
                    failed++;
            }
            catch {
                failed++;
            }
        }
        this.logger.log(`批量Token刷新完成: 成功 ${refreshed}, 失败 ${failed}`);
        return { refreshed, failed };
    }
    encryptToken(token) {
        const iv = crypto.randomBytes(16);
        const key = crypto.scryptSync(this.encryptionKey, 'matrixflow-salt', 32);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const json = JSON.stringify(token);
        let encrypted = cipher.update(json, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return iv.toString('hex') + ':' + authTag + ':' + encrypted;
    }
    decryptToken(encryptedToken) {
        const parts = encryptedToken.split(':');
        if (parts.length === 2) {
            this.logger.warn('检测到旧格式 CBC 加密 Token，建议重新授权以升级为 GCM');
            const [ivHex, encrypted] = parts;
            const iv = Buffer.from(ivHex, 'hex');
            const key = crypto.scryptSync(this.encryptionKey, 'matrixflow-salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return JSON.parse(decrypted);
        }
        const [ivHex, authTagHex, encrypted] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const key = crypto.scryptSync(this.encryptionKey, 'matrixflow-salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    }
};
exports.OAuthService = OAuthService;
exports.OAuthService = OAuthService = OAuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService,
        redis_service_1.RedisService])
], OAuthService);
//# sourceMappingURL=oauth.service.js.map