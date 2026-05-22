/**
 * OAuth流程管理
 * 授权URL生成、Token交换、Token刷新、状态管理
 *
 * 修复:
 * - #1: OAuth state 改为 Redis 存储，5分钟 TTL，Redis 不可用时 fallback 内存并打 warn
 * - #4: 加密算法从 aes-256-cbc 改为 aes-256-gcm（带 auth tag）
 * - #11: 平台客户端改为惰性单例，避免每次 new
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { RedisService } from '../../../redis/redis.service';
import { BasePlatformClient, PlatformToken } from '../clients/base-client';
import { DouyinClient } from '../clients/douyin.client';
import { KuaishouClient } from '../clients/kuaishou.client';
import { XiaohongshuClient } from '../clients/xiaohongshu.client';
import { ShipinhaoClient } from '../clients/shipinhao.client';
import { BilibiliClient } from '../clients/bilibili.client';
import { WeiboClient } from '../clients/weibo.client';
import { getPlatformConfig } from '../config/platform-config';

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

const OAUTH_STATE_TTL = 300; // 5 分钟

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly encryptionKey: string;

  // #11: 平台客户端惰性单例缓存
  private readonly clientCache = new Map<string, BasePlatformClient>();

  // #1: 内存 fallback（仅当 Redis 不可用时使用）
  private readonly stateStoreFallback = new Map<string, OAuthState>();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private redis: RedisService,
  ) {
    const tokenKey = this.configService.get<string>('TOKEN_ENCRYPTION_KEY');
    if (!tokenKey || tokenKey.length < 32) {
      throw new Error(
        'FATAL: TOKEN_ENCRYPTION_KEY environment variable is required and must be at least 32 characters.',
      );
    }
    this.encryptionKey = tokenKey;
  }

  /**
   * 获取平台客户端（单例）
   */
  getClient(platform: string): BasePlatformClient {
    if (this.clientCache.has(platform)) {
      return this.clientCache.get(platform)!;
    }

    const clientMap: Record<string, () => BasePlatformClient> = {
      DOUYIN: () => new DouyinClient(),
      KUAISHOU: () => new KuaishouClient(),
      XIAOHONGSHU: () => new XiaohongshuClient(),
      WECHAT_VIDEO: () => new ShipinhaoClient(),
      BILIBILI: () => new BilibiliClient(),
      WEIBO: () => new WeiboClient(),
    };

    const factory = clientMap[platform];
    if (!factory) {
      throw new BadRequestException(`不支持的平台: ${platform}`);
    }

    const client = factory();
    this.clientCache.set(platform, client);
    return client;
  }

  // ==================== #1: OAuth State 管理（Redis 优先） ====================

  private stateRedisKey(nonce: string): string {
    return `oauth:state:${nonce}`;
  }

  private async storeState(nonce: string, state: OAuthState): Promise<void> {
    try {
      await this.redis.setWithTTL(
        this.stateRedisKey(nonce),
        JSON.stringify(state),
        OAUTH_STATE_TTL,
      );
    } catch {
      this.logger.warn('Redis 存储 OAuth state 失败，fallback 到内存存储');
      this.stateStoreFallback.set(nonce, state);
    }
  }

  private async retrieveState(nonce: string): Promise<OAuthState | null> {
    try {
      const raw = await this.redis.get(this.stateRedisKey(nonce));
      if (raw) return JSON.parse(raw) as OAuthState;
    } catch {
      this.logger.warn('Redis 读取 OAuth state 失败，尝试内存 fallback');
    }
    // fallback 内存
    return this.stateStoreFallback.get(nonce) ?? null;
  }

  private async deleteState(nonce: string): Promise<void> {
    try {
      await this.redis.del(this.stateRedisKey(nonce));
    } catch {
      // ignore
    }
    this.stateStoreFallback.delete(nonce);
  }

  /**
   * 生成OAuth授权URL
   */
  async buildAuthorizeUrl(platform: string, userId: string, teamId?: string): Promise<string> {
    const nonce = crypto.randomBytes(16).toString('hex');
    const state: OAuthState = {
      userId,
      teamId,
      platform,
      nonce,
      timestamp: Date.now(),
    };

    // 将state编码为URL安全的字符串
    const stateStr = Buffer.from(JSON.stringify(state)).toString('base64url');
    await this.storeState(nonce, state);

    const client = this.getClient(platform);
    return client.buildAuthorizeUrl(stateStr);
  }

  /**
   * 处理OAuth回调
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{
    success: boolean;
    accountId?: string;
    platform?: string;
    message: string;
  }> {
    // 解析state
    let stateData: OAuthState;
    try {
      const decoded = Buffer.from(state, 'base64url').toString('utf8');
      stateData = JSON.parse(decoded);
    } catch {
      throw new BadRequestException('无效的OAuth state参数');
    }

    // 验证state
    const storedState = await this.retrieveState(stateData.nonce);
    if (!storedState) {
      throw new BadRequestException('OAuth state已过期或无效');
    }

    // 检查时间戳（5分钟有效期）
    if (Date.now() - stateData.timestamp > OAUTH_STATE_TTL * 1000) {
      await this.deleteState(stateData.nonce);
      throw new BadRequestException('OAuth state已过期');
    }

    await this.deleteState(stateData.nonce);

    const { platform, userId, teamId } = stateData;

    try {
      // 获取平台客户端并交换Token
      const client = this.getClient(platform);
      const token = await client.exchangeCode(code);
      const userInfo = await client.getUserInfo();

      // 加密存储Token
      const encryptedToken = this.encryptToken(token);

      // 创建或更新账号
      const account = await this.prisma.account.upsert({
        where: {
          platform_platformUserId: {
            platform: platform as any,
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
          platform: platform as any,
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
        message: `${getPlatformConfig(platform).name}授权成功`,
      };
    } catch (error: any) {
      this.logger.error(`OAuth授权失败: ${platform}`, error);
      return {
        success: false,
        platform,
        message: `授权失败: ${error.message}`,
      };
    }
  }

  /**
   * 刷新指定账号的Token
   */
  async refreshAccountToken(accountId: string): Promise<boolean> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new BadRequestException('账号不存在');
    }

    const metadata = (account.metadata ? JSON.parse(account.metadata) : {}) as Record<string, any>;
    if (!metadata?.oauthToken) {
      this.logger.warn(`账号 ${accountId} 无OAuth Token`);
      return false;
    }

    try {
      const client = this.getClient(account.platform);
      const token = this.decryptToken(metadata.oauthToken);
      client.setToken(token);

      // 触发Token刷新
      const userInfo = await client.getUserInfo();
      const newToken = client.getToken()!;

      // 更新加密Token
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
    } catch (error: any) {
      this.logger.error(`Token刷新失败: ${accountId}`, error);
      return false;
    }
  }

  /**
   * 批量刷新即将过期的Token
   */
  async refreshExpiringTokens(): Promise<{ refreshed: number; failed: number }> {
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const accounts = await this.prisma.account.findMany({
      where: {
        status: 'ACTIVE',
        metadata: { not: null },
      },
    });

    // Filter accounts with expiring OAuth tokens in JS (metadata is stored as JSON string)
    const expiringAccounts = accounts.filter((a) => {
      try {
        const md = JSON.parse(a.metadata || '{}');
        return md.tokenExpiresAt && new Date(md.tokenExpiresAt) <= threeDaysFromNow;
      } catch { return false; }
    });

    let refreshed = 0;
    let failed = 0;

    for (const account of expiringAccounts) {
      try {
        const success = await this.refreshAccountToken(account.id);
        if (success) refreshed++;
        else failed++;
      } catch {
        failed++;
      }
    }

    this.logger.log(`批量Token刷新完成: 成功 ${refreshed}, 失败 ${failed}`);
    return { refreshed, failed };
  }

  // ==================== #4: Token加密存储（aes-256-gcm） ====================

  private encryptToken(token: PlatformToken): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'matrixflow-salt', 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const json = JSON.stringify(token);
    let encrypted = cipher.update(json, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + authTag + ':' + encrypted;
  }

  private decryptToken(encryptedToken: string): PlatformToken {
    const parts = encryptedToken.split(':');
    if (parts.length === 2) {
      // 兼容旧的 CBC 格式（迁移期）
      this.logger.warn('检测到旧格式 CBC 加密 Token，建议重新授权以升级为 GCM');
      const [ivHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.scryptSync(this.encryptionKey, 'matrixflow-salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    }
    // 新的 GCM 格式: iv:authTag:encrypted
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
}
