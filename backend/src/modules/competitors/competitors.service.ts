import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Platform } from '../../common/prisma-enums';

@Injectable()
export class CompetitorsService {
  private readonly logger = new Logger(CompetitorsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 娣诲姞绔炲璐﹀彿
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
      throw new ConflictException('');
    }

    const competitor = await this.prisma.competitor.create({ data });
    this.logger.log(`绔炲娣诲姞: ${competitor.nickname} (${competitor.platform})`);
    return competitor;
  }

  /**
   * 鑾峰彇绔炲鍒楄〃
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
   * 鑾峰彇绔炲璇︽儏锛堝惈鍘嗗彶鏁版嵁锛?
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
      throw new NotFoundException('[garbled]');
    }

    return competitor;
  }

  /**
   * 鍒犻櫎绔炲
   */
  async remove(id: string, userId: string) {
    const competitor = await this.prisma.competitor.findFirst({
      where: { id, userId },
    });

    if (!competitor) {
      throw new NotFoundException('[garbled]');
    }

    await this.prisma.competitor.delete({ where: { id } });
    this.logger.log(`绔炲鍒犻櫎: ${competitor.nickname}`);
    return { success: true };
  }

  /**
   * 璁板綍绔炲蹇収锛堢敱瀹氭椂浠诲姟璋冪敤锛?
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

    // 鍚屾鏇存柊绔炲涓昏〃鐨勭矇涓濇暟
    await this.prisma.competitor.update({
      where: { id: competitorId },
      data: { followers: data.followers },
    });

    return snapshot;
  }

  /**
   * 鑾峰彇绔炲瀵规瘮鏁版嵁
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
