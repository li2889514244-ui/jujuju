import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully');
    } catch (error: any) {
      this.logger.error(`Failed to connect to database: ${error.message}`);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  /**
   * 清除所有数据（仅用于测试）
   */
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production');
    }
    // 顺序很重要 — 先删有外键依赖的表
    const models = Object.keys(this).filter((key) => !key.startsWith('_'));

    for (const modelKey of models) {
      const model = (this as any)[modelKey];
      if (model?.deleteMany) {
        await model.deleteMany();
      }
    }
  }
}
