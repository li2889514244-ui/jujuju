import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 获取用户的事件列表，支持日期范围查询
   */
  async findAll(
    userId: string,
    params?: {
      startDate?: string;
      endDate?: string;
      teamId?: string;
    },
  ) {
    const { startDate, endDate, teamId } = params || {};
    const where: any = { userId };

    if (teamId) {
      where.teamId = teamId;
    }

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) where.startTime.gte = new Date(startDate);
      if (endDate) where.startTime.lte = new Date(endDate);
    }

    return this.prisma.calendarEvent.findMany({
      where,
      orderBy: { startTime: 'asc' },
    });
  }

  /**
   * 创建事件
   */
  async create(
    userId: string,
    data: {
      title: string;
      description?: string;
      eventType?: string;
      startTime: string;
      endTime: string;
      color?: string;
      allDay?: boolean;
      location?: string;
      teamId?: string;
    },
  ) {
    const event = await this.prisma.calendarEvent.create({
      data: {
        title: data.title,
        description: data.description,
        eventType: (data.eventType as any) || 'OTHER',
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        color: data.color,
        allDay: data.allDay,
        location: data.location,
        teamId: data.teamId,
        userId,
      },
    });

    this.logger.log(`Calendar event created: ${event.title}`);
    return event;
  }

  /**
   * 更新事件
   */
  async update(
    id: string,
    userId: string,
    data: {
      title?: string;
      description?: string;
      eventType?: string;
      startTime?: string;
      endTime?: string;
      color?: string;
      allDay?: boolean;
      location?: string;
      teamId?: string;
    },
  ) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, userId },
    });

    if (!event) {
      throw new NotFoundException('Calendar event not found');
    }

    const updateData: any = { ...data };
    if (data.startTime) updateData.startTime = new Date(data.startTime);
    if (data.endTime) updateData.endTime = new Date(data.endTime);

    const updated = await this.prisma.calendarEvent.update({
      where: { id },
      data: updateData,
    });

    this.logger.log(`Calendar event updated: ${updated.title}`);
    return updated;
  }

  /**
   * 删除事件
   */
  async remove(id: string, userId: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, userId },
    });

    if (!event) {
      throw new NotFoundException('Calendar event not found');
    }

    await this.prisma.calendarEvent.delete({ where: { id } });
    this.logger.log(`Calendar event deleted: ${event.title}`);
    return { success: true };
  }
}
