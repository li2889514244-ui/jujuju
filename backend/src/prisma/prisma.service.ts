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
   * #16 修复: 使用 Prisma.dmmf 精确获取模型名，而非遍历 this 上的所有 key
   */
  async cleanDatabase() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production');
    }

    // 使用 DMMF 获取所有模型名，按依赖关系逆序删除
    const modelNames = PrismaClient.prototype.constructor.name === 'PrismaClient'
      ? (this as any)._dmmf?.datamodel?.models?.map((m: any) => m.name) ?? []
      : [];

    // 如果 DMMF 不可用，fallback 到已知模型列表
    const models = modelNames.length > 0
      ? modelNames
      : ['AuditLog', 'PostStats', 'DailyStats', 'Post', 'Account', 'Team', 'User', 'Organization'];

    for (const modelName of models) {
      // Prisma 客户端上的属性名是 camelCase
      const modelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1);
      const model = (this as any)[modelKey];
      if (model?.deleteMany) {
        await model.deleteMany();
      }
    }
  }
}
