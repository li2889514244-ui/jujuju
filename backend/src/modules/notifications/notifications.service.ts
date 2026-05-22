import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType } from '../../common/prisma-enums';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 创建通知
   */
  async create(params: {
    userId: string;
    type: NotificationType;
    title: string;
    content?: string;
    metadata?: Record<string, any>;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        content: params.content || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
      },
    });
    this.logger.log(`通知已创建: [${params.type}] ${params.title} -> ${params.userId}`);
    return notification;
  }

  /**
   * 获取用户通知列表
   */
  async findAll(userId: string, params: { skip?: number; take?: number; unreadOnly?: boolean }) {
    const { skip = 0, take = 20, unreadOnly = false } = params;

    const where: any = { userId };
    if (unreadOnly) where.read = false;

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);

    return { notifications, total, unreadCount, skip, take };
  }

  /**
   * 获取未读数量
   */
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    });
    return { unreadCount: count };
  }

  /**
   * 标记单条已读
   */
  async markAsRead(id: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
    return { success: true };
  }

  /**
   * 全部标记已读
   */
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { success: true, count: result.count };
  }

  /**
   * 删除通知
   */
  async remove(id: string, userId: string) {
    await this.prisma.notification.deleteMany({
      where: { id, userId },
    });
    return { success: true };
  }

  /**
   * 清空所有已读通知
   */
  async clearRead(userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: { userId, read: true },
    });
    return { success: true, count: result.count };
  }
}
