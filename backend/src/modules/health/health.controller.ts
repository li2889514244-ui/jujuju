import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService, HealthCheckResult } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: '健康检查' })
  @ApiResponse({ status: 200, description: '服务正常' })
  @ApiResponse({ status: 503, description: '服务异常' })
  async check(): Promise<HealthCheckResult> {
    return this.healthService.check();
  }
}
