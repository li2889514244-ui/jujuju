import {
  Controller,
  Get,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('analytics')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: '获取数据概览' })
  async getOverview(@CurrentUser('id') userId: string) {
    return this.analyticsService.getOverview(userId);
  }

  /**
   * #9 修复: 校验账号归属
   */
  @Get('daily')
  @ApiOperation({ summary: '获取每日统计数据' })
  async getDailyStats(
    @Query() dto: QueryAnalyticsDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
  ) {
    if (dto.accountId) {
      await this.verifyAccountOwnership(dto.accountId, userId, userRole);
    }
    return this.analyticsService.getDailyStats(dto);
  }

  /**
   * #9 修复: 校验账号归属
   */
  @Get('posts')
  @ApiOperation({ summary: '获取内容表现统计' })
  async getPostStats(
    @Query() dto: QueryAnalyticsDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
  ) {
    if (dto.accountId) {
      await this.verifyAccountOwnership(dto.accountId, userId, userRole);
    }
    return this.analyticsService.getPostStats(dto);
  }

  @Get('platforms')
  @ApiOperation({ summary: '获取平台维度对比数据' })
  async getPlatformComparison(@CurrentUser('id') userId: string) {
    return this.analyticsService.getPlatformComparison(userId);
  }

  @Get('report')
  @ApiOperation({ summary: '生成数据报表（JSON格式，前端可导出为Excel/PDF）' })
  async getReport(
    @CurrentUser('id') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('platform') platform?: string,
  ) {
    return this.analyticsService.generateReport(userId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      platform,
    });
  }

  @Get('comparison')
  @ApiOperation({ summary: '数据同比环比对比（周环比、月环比、年同比）' })
  async getComparison(@CurrentUser('id') userId: string) {
    return this.analyticsService.getComparison(userId);
  }

  @Get('views-ranking')
  @ApiOperation({ summary: '播放量榜单（按播放量排名）' })
  @ApiQuery({ name: 'limit', required: false, description: '返回条数（默认50）' })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'all'], description: '时间范围' })
  @ApiQuery({ name: 'platform', required: false, description: '平台筛选' })
  async getViewsRanking(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: number,
    @Query('period') period?: 'week' | 'month' | 'all',
    @Query('platform') platform?: string,
  ) {
    return this.analyticsService.getViewsRanking(userId, {
      limit: limit ? Math.min(100, Math.max(1, Number(limit))) : 50,
      period: period || 'all',
      platform,
    });
  }

  /**
   * 校验账号是否属于当前用户（管理员除外）
   */
  private async verifyAccountOwnership(
    accountId: string,
    userId: string,
    userRole: string,
  ) {
    if (['OWNER', 'ADMIN'].includes(userRole)) return;

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { userId: true },
    });

    if (!account || account.userId !== userId) {
      throw new ForbiddenException('无权查看此账号的数据统计');
    }
  }
}
