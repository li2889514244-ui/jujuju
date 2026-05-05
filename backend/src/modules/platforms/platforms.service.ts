/**
 * 平台管理服务核心
 * 整合OAuth、数据采集、Token管理
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OAuthService } from './oauth/oauth.service';
import { PLATFORM_CONFIGS } from './config/platform-config';
import { IDataCollector } from './collectors/data-collector.interface';
import { DouyinCollector } from './collectors/douyin.collector';
import { KuaishouCollector } from './collectors/kuaishou.collector';
import { XiaohongshuCollector } from './collectors/xiaohongshu.collector';
import { ShipinhaoCollector } from './collectors/shipinhao.collector';
import { BilibiliCollector } from './collectors/bilibili.collector';
import { WeiboCollector } from './collectors/weibo.collector';

@Injectable()
export class PlatformsService {
  private readonly logger = new Logger(PlatformsService.name);
  private readonly collectors: Map<string, IDataCollector>;

  constructor(
    private prisma: PrismaService,
    private oauthService: OAuthService,
    douyinCollector: DouyinCollector,
    kuaishouCollector: KuaishouCollector,
    xiaohongshuCollector: XiaohongshuCollector,
    shipinhaoCollector: ShipinhaoCollector,
    bilibiliCollector: BilibiliCollector,
    weiboCollector: WeiboCollector,
  ) {
    this.collectors = new Map<string, IDataCollector>([
      ['DOUYIN', douyinCollector],
      ['KUAISHOU', kuaishouCollector],
      ['XIAOHONGSHU', xiaohongshuCollector],
      ['WECHAT_VIDEO', shipinhaoCollector],
      ['BILIBILI', bilibiliCollector],
      ['WEIBO', weiboCollector],
    ]);
  }

  // ==================== 平台信息 ====================

  /**
   * 获取所有支持的平台列表
   */
  getSupportedPlatforms() {
    return Object.entries(PLATFORM_CONFIGS).map(([key, config]) => ({
      key,
      name: config.name,
      oauthUrl: config.oauth.authorizeUrl,
      scopes: config.oauth.scopes,
    }));
  }

  /**
   * 获取平台配置信息
   */
  getPlatformInfo(platform: string) {
    const config = PLATFORM_CONFIGS[platform];
    if (!config) {
      throw new NotFoundException(`不支持的平台: ${platform}`);
    }
    return {
      key: platform,
      name: config.name,
      scopes: config.oauth.scopes,
      rateLimit: config.api.rateLimit,
    };
  }

  // ==================== OAuth授权 ====================

  /**
   * 获取OAuth授权URL
   */
  getAuthorizeUrl(platform: string, userId: string, teamId?: string): string {
    if (!PLATFORM_CONFIGS[platform]) {
      throw new BadRequestException(`不支持的平台: ${platform}`);
    }
    return this.oauthService.buildAuthorizeUrl(platform, userId, teamId);
  }

  /**
   * 解除平台授权
   */
  async revokeAuthorization(accountId: string, userId: string): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('账号不存在');
    }

    // 权限检查
    if (account.userId !== userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
        throw new BadRequestException('无权操作此账号');
      }
    }

    // 清除OAuth Token
    const metadata = account.metadata as Record<string, any>;
    const { oauthToken, tokenExpiresAt, scope, ...restMetadata } = metadata || {};

    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        metadata: restMetadata,
        status: 'INACTIVE',
      },
    });

    this.logger.log(`平台授权已解除: ${account.platform} - ${account.nickname}`);
  }

  // ==================== 数据采集 ====================

  /**
   * 获取指定平台的采集器
   */
  private getCollector(platform: string): IDataCollector {
    const collector = this.collectors.get(platform);
    if (!collector) {
      throw new BadRequestException(`不支持的平台数据采集: ${platform}`);
    }
    return collector;
  }

  /**
   * 采集单个账号数据
   */
  async collectAccountData(
    accountId: string,
    type: 'account' | 'content' | 'daily' = 'daily',
  ) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('账号不存在');
    }

    const collector = this.getCollector(account.platform);

    switch (type) {
      case 'account':
        return collector.collectAccountMetrics(accountId);
      case 'content':
        return collector.collectContentMetrics(accountId);
      case 'daily':
        return collector.collectDailyMetrics(accountId);
    }
  }

  /**
   * 批量采集数据
   */
  async batchCollectData(
    accountIds: string[],
    type: 'account' | 'content' | 'daily' = 'daily',
  ) {
    const results: Array<{
      accountId: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const accountId of accountIds) {
      try {
        const result = await this.collectAccountData(accountId, type);
        results.push({
          accountId,
          success: result.success,
          error: result.error,
        });
      } catch (error: any) {
        results.push({
          accountId,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    this.logger.log(
      `批量采集完成: ${successCount}/${accountIds.length} 成功`,
    );

    return {
      total: accountIds.length,
      success: successCount,
      failed: accountIds.length - successCount,
      results,
    };
  }

  // ==================== Token管理 ====================

  /**
   * 刷新指定账号的Token
   */
  async refreshToken(accountId: string): Promise<boolean> {
    return this.oauthService.refreshAccountToken(accountId);
  }

  /**
   * 批量刷新即将过期的Token
   */
  async refreshExpiringTokens() {
    return this.oauthService.refreshExpiringTokens();
  }

  // ==================== 已授权平台列表 ====================

  /**
   * 获取已授权的平台账号列表
   */
  async getAuthorizedAccounts(params: {
    userId?: string;
    teamId?: string;
    platform?: string;
    skip?: number;
    take?: number;
  }) {
    const { userId, teamId, platform, skip = 0, take = 20 } = params;

    const where: any = { status: 'ACTIVE' };
    if (userId) where.userId = userId;
    if (teamId) where.teamId = teamId;
    if (platform) where.platform = platform;

    const [accounts, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          platform: true,
          platformUserId: true,
          nickname: true,
          avatar: true,
          bio: true,
          followers: true,
          following: true,
          status: true,
          lastActiveAt: true,
          createdAt: true,
          owner: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.account.count({ where }),
    ]);

    // 标记Token状态
    const accountsWithTokenStatus = accounts.map((account: any) => {
      const metadata = (account as any).metadata as Record<string, any>;
      const tokenExpiresAt = metadata?.tokenExpiresAt;
      let tokenStatus = 'unknown';

      if (tokenExpiresAt) {
        const expiresAt = new Date(tokenExpiresAt).getTime();
        if (Date.now() >= expiresAt) {
          tokenStatus = 'expired';
        } else if (Date.now() >= expiresAt - 3 * 24 * 60 * 60 * 1000) {
          tokenStatus = 'expiring_soon';
        } else {
          tokenStatus = 'valid';
        }
      }

      return {
        ...account,
        tokenStatus,
        hasOAuth: !!metadata?.oauthToken,
      };
    });

    return {
      accounts: accountsWithTokenStatus,
      total,
      skip,
      take,
    };
  }
}
