import { Controller, Get, Post, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
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
  async getOverview(@CurrentUser('id') userId: string) {
    return this.analyticsService.getOverview(userId);
  }

  @Get('daily')
  async getDailyStats(@Query() dto: QueryAnalyticsDto, @CurrentUser('id') userId: string, @CurrentUser('role') userRole: string) {
    if (dto.accountId) await this.verifyAccountOwnership(dto.accountId, userId, userRole);
    return this.analyticsService.getDailyStats(dto);
  }

  @Get('posts')
  async getPostStats(@Query() dto: QueryAnalyticsDto, @CurrentUser('id') userId: string, @CurrentUser('role') userRole: string) {
    if (dto.accountId) await this.verifyAccountOwnership(dto.accountId, userId, userRole);
    return this.analyticsService.getPostStats(dto);
  }

  @Get('platforms')
  async getPlatformComparison(@CurrentUser('id') userId: string) {
    return this.analyticsService.getPlatformComparison(userId);
  }

  @Get('report')
  async getReport(@CurrentUser('id') userId: string, @Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('platform') platform?: string) {
    return this.analyticsService.generateReport(userId, { startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined, platform });
  }

  @Get('comparison')
  async getComparison(@CurrentUser('id') userId: string) {
    return this.analyticsService.getComparison(userId);
  }

  @Get('views-ranking')
  async getViewsRanking(@CurrentUser('id') userId: string, @Query('limit') limit?: number, @Query('period') period?: 'week' | 'month' | 'all', @Query('platform') platform?: string) {
    return this.analyticsService.getViewsRanking(userId, { limit: limit ? Math.min(100, Math.max(1, Number(limit))) : 50, period: period || 'all', platform });
  }

  @Get('followers/trend')
  async getFollowerTrend(@CurrentUser('id') userId: string, @Query('days') days?: number, @Query('platform') platform?: string) {
    return this.analyticsService.getFollowerTrend(userId, days || 7, platform);
  }

  @Get('likes/trend')
  async getLikesTrend(@CurrentUser('id') userId: string, @Query('days') days?: number, @Query('platform') platform?: string) {
    return this.analyticsService.getLikesTrend(userId, days || 7, platform);
  }

  @Get('publish-effect')
  async getPublishEffect(@CurrentUser('id') userId: string, @Query('days') days?: number, @Query('contentId') contentId?: string) {
    return this.analyticsService.getPublishEffect(userId, days, contentId);
  }

  @Get('engagement')
  async getEngagementRate(@CurrentUser('id') userId: string, @Query('days') days?: number, @Query('platform') platform?: string) {
    return this.analyticsService.getEngagementRate(userId, days || 7, platform);
  }

  @Get('export')
  async exportReport(@CurrentUser('id') userId: string, @Query('startDate') startDate: string, @Query('endDate') endDate: string, @Query('format') format: 'csv' | 'xlsx') {
    return this.analyticsService.exportReport(userId, startDate, endDate, format);
  }

  @Post('collect')
  async collectStats(@CurrentUser('id') userId: string) {
    return this.analyticsService.collectStats(userId);
  }

  @Get('account/:id')
  async getAccountAnalytics(@Param('id') accountId: string, @CurrentUser('id') userId: string, @CurrentUser('role') userRole: string) {
    await this.verifyAccountOwnership(accountId, userId, userRole);
    return this.analyticsService.getAccountAnalytics(accountId);
  }

  @Get('account/:id/posts')
  async getAccountPosts(
    @Param('id') accountId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    await this.verifyAccountOwnership(accountId, userId, userRole);
    return this.analyticsService.getAccountPosts(accountId, {
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Math.min(100, Number(pageSize)) : 20,
      sortBy: sortBy || 'createdAt',
      sortOrder: sortOrder || 'desc',
    });
  }

  private async verifyAccountOwnership(accountId: string, userId: string, userRole: string) {
    if (['OWNER', 'ADMIN'].includes(userRole)) return;
    const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { userId: true } });
    if (!account || account.userId !== userId) throw new ForbiddenException('无权查看此账号的数据统计');
  }
}
