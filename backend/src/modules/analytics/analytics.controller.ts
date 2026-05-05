import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('analytics')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: '获取数据概览' })
  async getOverview(@CurrentUser('id') userId: string) {
    return this.analyticsService.getOverview(userId);
  }

  @Get('daily')
  @ApiOperation({ summary: '获取每日统计数据' })
  async getDailyStats(@Query() dto: QueryAnalyticsDto) {
    return this.analyticsService.getDailyStats(dto);
  }

  @Get('posts')
  @ApiOperation({ summary: '获取内容表现统计' })
  async getPostStats(@Query() dto: QueryAnalyticsDto) {
    return this.analyticsService.getPostStats(dto);
  }

  @Get('platforms')
  @ApiOperation({ summary: '获取平台维度对比数据' })
  async getPlatformComparison(@CurrentUser('id') userId: string) {
    return this.analyticsService.getPlatformComparison(userId);
  }
}
