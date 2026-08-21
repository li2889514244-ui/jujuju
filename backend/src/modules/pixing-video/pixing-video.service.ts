import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto';

@Injectable()
export class PixingVideoService {
  private readonly logger = new Logger(PixingVideoService.name);

  constructor(private prisma: PrismaService) {}

  async createTask(userId: string, dto: CreateTaskDto) {
    return this.prisma.pixingVideoTask.create({
      data: {
        userId,
        teacher: dto.teacher,
        text: dto.text,
        status: 'pending',
      },
    });
  }

  async listTasks(userId: string, status?: string) {
    const where: any = { userId };
    if (status) where.status = status;
    return this.prisma.pixingVideoTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getTask(id: string, userId: string) {
    const task = await this.prisma.pixingVideoTask.findFirst({
      where: { id, userId },
    });
    if (!task) throw new NotFoundException('任务不存在');
    return task;
  }

  // 本地服务专用：获取下一个待处理任务（需要服务级 token 认证）
  async getNextPendingTask() {
    return this.prisma.pixingVideoTask.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateTask(id: string, dto: UpdateTaskDto) {
    const task = await this.prisma.pixingVideoTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('任务不存在');

    return this.prisma.pixingVideoTask.update({
      where: { id },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.videoUrl !== undefined && { videoUrl: dto.videoUrl }),
        ...(dto.srtContent !== undefined && { srtContent: dto.srtContent }),
        ...(dto.error !== undefined && { error: dto.error }),
      },
    });
  }
}
