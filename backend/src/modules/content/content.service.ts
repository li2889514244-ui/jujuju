import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContentDto } from './dto/create-content.dto';
import { PostStatus, Prisma } from '@prisma/client';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 创建内容（草稿）
   */
  async create(dto: CreateContentDto, userId: string) {
    // 验证账号归属
    const account = await this.prisma.account.findUnique({
      where: { id: dto.accountId },
    });

    if (!account) {
      throw new NotFoundException('关联账号不存在');
    }

    if (account.userId !== userId) {
      throw new ForbiddenException('无权为此账号创建内容');
    }

    const post = await this.prisma.post.create({
      data: {
        title: dto.title,
        content: dto.content,
        mediaUrls: dto.mediaUrls || undefined,
        tags: dto.tags || [],
        publishAt: dto.publishAt ? new Date(dto.publishAt) : null,
        status: dto.publishAt ? 'SCHEDULED' : 'DRAFT',
        accountId: dto.accountId,
      },
      include: {
        account: {
          select: {
            id: true,
            platform: true,
            nickname: true,
          },
        },
      },
    });

    this.logger.log(`内容创建成功: ${post.id} (${post.status})`);
    return post;
  }

  /**
   * 获取内容列表
   */
  async findAll(params: {
    userId?: string;
    accountId?: string;
    status?: PostStatus;
    platform?: string;
    skip?: number;
    take?: number;
  }) {
    const { userId, accountId, status, platform, skip = 0, take = 20 } = params;

    const where: Prisma.PostWhereInput = {};

    if (accountId) {
      where.accountId = accountId;
    } else if (userId) {
      where.account = { userId };
    }

    if (status) where.status = status;
    if (platform) where.account = { ...where.account as any, platform: platform as any };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take,
        include: {
          account: {
            select: {
              id: true,
              platform: true,
              nickname: true,
              avatar: true,
            },
          },
          stats: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.post.count({ where }),
    ]);

    return { posts, total, skip, take };
  }

  /**
   * #8 修复: 获取内容详情 — 添加 userId 跨租户隔离校验
   */
  async findById(id: string, userId?: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        account: {
          select: {
            id: true,
            platform: true,
            nickname: true,
            avatar: true,
            userId: true,
            owner: {
              select: { id: true, name: true },
            },
          },
        },
        stats: true,
      },
    });

    if (!post) {
      throw new NotFoundException('内容不存在');
    }

    // #8: 跨租户隔离 — 非管理员只能查看自己账号下的内容
    if (userId && post.account.userId !== userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
        throw new ForbiddenException('无权查看此内容');
      }
    }

    return post;
  }

  /**
   * 更新内容
   */
  async update(id: string, data: Partial<CreateContentDto>, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!post) {
      throw new NotFoundException('内容不存在');
    }

    // 只有草稿和定时状态可以修改
    if (!['DRAFT', 'SCHEDULED'].includes(post.status)) {
      throw new BadRequestException('只有草稿和定时状态的内容可以修改');
    }

    if (post.account.userId !== userId) {
      throw new ForbiddenException('无权修改此内容');
    }

    const updateData: Prisma.PostUpdateInput = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.mediaUrls !== undefined) updateData.mediaUrls = data.mediaUrls;
    if (data.tags !== undefined) updateData.tags = data.tags;
    if (data.publishAt !== undefined) {
      updateData.publishAt = data.publishAt ? new Date(data.publishAt) : null;
      updateData.status = data.publishAt ? 'SCHEDULED' : 'DRAFT';
    }

    return this.prisma.post.update({
      where: { id },
      data: updateData,
      include: {
        account: {
          select: { id: true, platform: true, nickname: true },
        },
      },
    });
  }

  /**
   * 删除内容
   */
  async remove(id: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!post) {
      throw new NotFoundException('内容不存在');
    }

    if (post.account.userId !== userId) {
      throw new ForbiddenException('无权删除此内容');
    }

    if (post.status === 'PUBLISHING') {
      throw new BadRequestException('发布中的内容无法删除');
    }

    await this.prisma.post.delete({ where: { id } });
    this.logger.log(`内容已删除: ${id}`);
    return { success: true };
  }

  /**
   * 发布内容
   */
  async publish(contentId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: contentId },
      include: { account: true },
    });

    if (!post) {
      throw new NotFoundException('内容不存在');
    }

    if (post.account.userId !== userId) {
      throw new ForbiddenException('无权发布此内容');
    }

    if (!['DRAFT', 'SCHEDULED', 'FAILED'].includes(post.status)) {
      throw new BadRequestException(`当前状态 ${post.status} 不允许发布`);
    }

    // 更新状态为发布中
    const updated = await this.prisma.post.update({
      where: { id: contentId },
      data: { status: 'PUBLISHING' },
    });

    this.logger.log(`内容开始发布: ${contentId}`);
    // 实际发布逻辑由 BrowserService 异步处理
    return updated;
  }

  /**
   * 更新发布状态（由浏览器服务回调）
   */
  async updatePublishStatus(
    contentId: string,
    status: PostStatus,
    platformUrl?: string,
    errorMsg?: string,
  ) {
    return this.prisma.post.update({
      where: { id: contentId },
      data: {
        status,
        platformUrl: platformUrl || undefined,
        errorMsg: errorMsg || undefined,
      },
    });
  }

  /**
   * 获取待发布的内容（定时发布队列）
   */
  async getScheduledPosts() {
    return this.prisma.post.findMany({
      where: {
        status: 'SCHEDULED',
        publishAt: { lte: new Date() },
      },
      include: {
        account: {
          select: {
            id: true,
            platform: true,
            nickname: true,
          },
        },
      },
      orderBy: { publishAt: 'asc' },
    });
  }
}
