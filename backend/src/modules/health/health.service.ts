import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
  checks?: {
    database: { status: 'ok' | 'error'; responseTime?: number; error?: string };
    memory: { status: 'ok' | 'error'; usedMB: number; totalMB: number; percentage: number };
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();

  constructor(private prisma: PrismaService) {}

  async check(): Promise<HealthCheckResult> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkMemory(),
    ]);

    const dbResult =
      checks[0].status === 'fulfilled'
        ? checks[0].value
        : { status: 'error' as const, error: 'Health check failed' };

    const memResult =
      checks[1].status === 'fulfilled'
        ? checks[1].value
        : { status: 'error' as const, usedMB: 0, totalMB: 0, percentage: 0 };

    const allOk = dbResult.status === 'ok' && memResult.status === 'ok';

    // #21 修复: 生产环境只返回 status，不暴露内部错误细节
    const isProd = process.env.NODE_ENV === 'production';

    const result: HealthCheckResult = {
      status: allOk ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version || '0.1.0',
    };

    if (!isProd) {
      result.checks = {
        database: dbResult,
        memory: memResult,
      };
    }

    return result;
  }

  private async checkDatabase(): Promise<{
    status: 'ok' | 'error';
    responseTime?: number;
    error?: string;
  }> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        responseTime: Date.now() - start,
      };
    } catch (error: any) {
      this.logger.error(`Database health check failed: ${error.message}`);
      return {
        status: 'error',
        error: error.message,
      };
    }
  }

  private checkMemory(): {
    status: 'ok' | 'error';
    usedMB: number;
    totalMB: number;
    percentage: number;
  } {
    const memUsage = process.memoryUsage();
    const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const percentage = Math.round((usedMB / totalMB) * 100);

    return {
      status: percentage > 90 ? 'error' : 'ok',
      usedMB,
      totalMB,
      percentage,
    };
  }
}
