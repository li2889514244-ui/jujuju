import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Platform } from '@prisma/client';

@Injectable()
export class CompetitorsService {
  private readonly logger = new Logger(CompetitorsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 添加竞对账号
   */
  async create(data: {
    platform: Platform;
    platformUserId: string;
    nickname: string;
    avatar?: string;
    bio?: string;
    note?: string;
    userId: string;
  }) {
    const existing = await this.prisma.competitor.findUnique({
      where: {
        platform_platformUserId_userId: {
          platform: data.platform,
          platformUserId: data.platformUserId,
          userId: data.userId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('该竞对账号已存在');
    }

    const competitor = await this.prisma.competitor.create({ data });
    this.logger.log(`竞对添加: ${competitor.nickname} (${competitor.platform})`);
    return competitor;
  }

  /**
   * 获取竞对列表
   */
  async findAll(userId: string, params?: { platform?: Platform; skip?: number; take?: number }) {
    const { platform, skip = 0, take = 50 } = params || {};
    const where: any = { userId };
    if (platform) where.platform = platform;

    const [competitors, total] = await Promise.all([
      this.prisma.competitor.findMany({
        where,
        skip,
        take,
        include: {
          snapshots: {
            orderBy: { date: 'desc' },
            take: 7,
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.competitor.count({ where }),
    ]);

    return { competitors, total, skip, take };
  }

  /**
   * 获取竞对详情（含历史数据）
   */
  async findById(id: string, userId: string) {
    const competitor = await this.prisma.competitor.findFirst({
      where: { id, userId },
      include: {
        snapshots: {
          orderBy: { date: 'desc' },
          take: 30,
        },
      },
    });

    if (!competitor) {
      throw new NotFoundException('竞对不存在');
    }

    return competitor;
  }

  /**
   * 删除竞对
   */
  async remove(id: string, userId: string) {
    const competitor = await this.prisma.competitor.findFirst({
      where: { id, userId },
    });

    if (!competitor) {
      throw new NotFoundException('竞对不存在');
    }

    await this.prisma.competitor.delete({ where: { id } });
    this.logger.log(`竞对删除: ${competitor.nickname}`);
    return { success: true };
  }

  /**
   * 记录竞对快照（由定时任务调用）
   */
  async recordSnapshot(competitorId: string, data: {
    followers: number;
    views: number;
    likes: number;
    comments: number;
    posts: number;
  }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const snapshot = await this.prisma.competitorSnapshot.upsert({
      where: {
        competitorId_date: {
          competitorId,
          date: today,
        },
      },
      update: data,
      create: {
        competitorId,
        date: today,
        ...data,
      },
    });

    // 同步更新竞对主表的粉丝数
    await this.prisma.competitor.update({
      where: { id: competitorId },
      data: { followers: data.followers },
    });

    return snapshot;
  }

  /**
   * 获取竞对对比数据
   */
  async compare(userId: string, competitorIds: string[], days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const competitors = await this.prisma.competitor.findMany({
      where: { id: { in: competitorIds }, userId },
      include: {
        snapshots: {
          where: { date: { gte: startDate } },
          orderBy: { date: 'asc' },
        },
      },
    });

    return competitors;
  }
}
