/**
 * B站数据采集器
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BilibiliClient } from '../clients/bilibili.client';
import { OAuthService } from '../oauth/oauth.service';
import {
  IDataCollector,
  AccountMetrics,
  ContentMetrics,
  DailyMetrics,
  CollectorResult,
} from './data-collector.interface';

@Injectable()
export class BilibiliCollector implements IDataCollector {
  readonly platform = 'BILIBILI';
  private readonly logger = new Logger(BilibiliCollector.name);

  constructor(
    private prisma: PrismaService,
    private oauthService: OAuthService,
  ) {}

  private async getClient(accountId: string): Promise<BilibiliClient> {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new Error('账号不存在');

    const client = new BilibiliClient();
    const metadata = account.metadata as Record<string, any>;
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
      this.logger.error(`B站数据采集失败: ${accountId}`, error);
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
      const mid = parseInt(account!.platformUserId);

      const page = options?.cursor ? parseInt(options.cursor) : 1;
      const videoList = await client.getVideoList(mid, page, options?.limit || 20);

      const contents: ContentMetrics[] = videoList.data.list.vlist.map((video) => ({
        contentId: video.bvid,
        title: video.title,
        platform: this.platform,
        views: video.play,
        likes: video.like,
        comments: video.comment,
        shares: video.share,
        saves: video.favorites,
        createdAt: new Date(video.created * 1000),
        collectedAt: new Date(),
      }));

      return { success: true, data: contents, collectedAt: new Date() };
    } catch (error: any) {
      this.logger.error(`B站内容数据采集失败: ${accountId}`, error);
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
          accountId, date: new Date(), platform: 'BILIBILI' as any,
          followers: dailyData.followers, views: dailyData.views,
          likes: dailyData.likes, comments: dailyData.comments, shares: dailyData.shares,
        },
      });

      return { success: true, data: dailyData, collectedAt: new Date() };
    } catch (error: any) {
      this.logger.error(`B站每日数据采集失败: ${accountId}`, error);
      return { success: false, error: error.message, collectedAt: new Date() };
    }
  }
}
