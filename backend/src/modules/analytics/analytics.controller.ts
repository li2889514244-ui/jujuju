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
