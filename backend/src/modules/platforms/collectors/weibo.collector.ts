/**
 * 微博数据采集器
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WeiboClient } from '../clients/weibo.client';
import { OAuthService } from '../oauth/oauth.service';
import {
  IDataCollector,
  AccountMetrics,
  ContentMetrics,
  DailyMetrics,
  CollectorResult,
} from './data-collector.interface';

@Injectable()
export class WeiboCollector implements IDataCollector {
  readonly platform = 'WEIBO';
  private readonly logger = new Logger(WeiboCollector.name);

  constructor(
    private prisma: PrismaService,
    private oauthService: OAuthService,
  ) {}

  private async getClient(accountId: string): Promise<WeiboClient> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new Error('账号不存在');

    const client = new WeiboClient();
    const metadata = (account.metadata || '{}') as unknown as Record<string, any>;
    if (metadata?.oauthToken) {
      const token = this.oauthService['decryptToken'](metadata.oauthToken);
      client.setToken(token);
    }
    return client;
  }

  async collectAccountMetrics(accountId: string): Promise<CollectorResult<AccountMetrics>> {
    try {
      const client = await this.getClient(accountId);
      const userInfo = await client.getUserInfo();

      await this.prisma.account.update({
        where: { id: accountId },
        data: {
          followers: userInfo.followers || 0,
          following: userInfo.following || 0,
          nickname: userInfo.nickname,
          avatar: userInfo.avatar,
          bio: userInfo.bio,
          lastActiveAt: new Date(),
        },
      });

      return {
        success: true,
        data: {
          platform: this.platform,
          platformUserId: userInfo.platformUserId,
          nickname: userInfo.nickname,
          followers: userInfo.followers || 0,
          following: userInfo.following || 0,
          totalViews: 0, totalLikes: 0, totalComments: 0, totalShares: 0,
          collectedAt: new Date(),
        },
        collectedAt: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`微博数据采集失败: ${accountId}`, error);
      return { success: false, error: error.message, collectedAt: new Date() };
    }
  }

  async collectContentMetrics(
    accountId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<CollectorResult<ContentMetrics[]>> {
    try {
      const client = await this.getClient(accountId);
      const account = await this.prisma.account.findUnique({ where: { id: accountId } });
      const page = options?.cursor ? parseInt(options.cursor) : 1;

      const statusList = await client.getStatusList(account!.platformUserId, page, options?.limit || 20);

      const contents: ContentMetrics[] = statusList.statuses.map((status) => ({
        contentId: String(status.id),
        title: status.text?.substring(0, 100) || '',
        platform: this.platform,
        views: 0, // 微博不直接暴露阅读数
        likes: status.attitudes_count,
        comments: status.comments_count,
        shares: status.reposts_count,
        saves: 0,
        createdAt: new Date(status.created_at),
        collectedAt: new Date(),
      }));

      return { success: true, data: contents, collectedAt: new Date() };
    } catch (error: any) {
      this.logger.error(`微博内容数据采集失败: ${accountId}`, error);
      return { success: false, error: error.message, collectedAt: new Date() };
    }
  }

  async collectDailyMetrics(accountId: string): Promise<CollectorResult<DailyMetrics>> {
    try {
      const accountMetrics = await this.collectAccountMetrics(accountId);
      if (!accountMetrics.success || !accountMetrics.data) {
        return { success: false, error: accountMetrics.error, collectedAt: new Date() };
      }

      const contentMetrics = await this.collectContentMetrics(accountId);
      const totalViews = contentMetrics.data?.reduce((sum, c) => sum + c.views, 0) || 0;
      const totalLikes = contentMetrics.data?.reduce((sum, c) => sum + c.likes, 0) || 0;
      const totalComments = contentMetrics.data?.reduce((sum, c) => sum + c.comments, 0) || 0;
      const totalShares = contentMetrics.data?.reduce((sum, c) => sum + c.shares, 0) || 0;

      const dailyData: DailyMetrics = {
        platform: this.platform,
        platformUserId: accountMetrics.data.platformUserId,
        date: new Date(),
        followers: accountMetrics.data.followers,
        views: totalViews, likes: totalLikes, comments: totalComments, shares: totalShares,
      };

      await this.prisma.dailyStats.create({
        data: {
          accountId, date: new Date(), platform: 'WEIBO' as any,
          followers: dailyData.followers, views: dailyData.views,
          likes: dailyData.likes, comments: dailyData.comments, shares: dailyData.shares,
        },
      });

      return { success: true, data: dailyData, collectedAt: new Date() };
    } catch (error: any) {
      this.logger.error(`微博每日数据采集失败: ${accountId}`, error);
      return { success: false, error: error.message, collectedAt: new Date() };
    }
  }
}
