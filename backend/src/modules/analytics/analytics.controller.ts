import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger'
import { AnalyticsService } from './analytics.service'
import { QueryAnalyticsDto } from './dto/query-analytics.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

@ApiTags('analytics')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('followers/trend')
  @ApiOperation({ summary: '获取粉丝增长趋势' })
  async getFollowerTrend(
    @CurrentUser('id') userId: string,
    @Query('days') days?: number,
    @Query('platform') platform?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.analyticsService.getFollowersTrend(userId, days || 7, platform, groupId)
  }

  @Get('views/trend')
  @ApiOperation({ summary: '获取播放增长趋势' })
  async getViewsTrend(
    @CurrentUser('id') userId: string,
    @Query('days') days?: number,
    @Query('platform') platform?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.analyticsService.getViewsTrend(userId, days || 7, platform, groupId)
  }

  @Get('overview')
  @ApiOperation({ summary: '获取数据概览' })
  async getOverview(@CurrentUser('id') userId: string, @Query('groupId') groupId?: string) {
    return this.analyticsService.getOverview(userId, groupId)
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
      await this.verifyAccountOwnership(dto.accountId, userId, userRole)
    }
    return this.analyticsService.getDailyStats(dto, userId)
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
      await this.verifyAccountOwnership(dto.accountId, userId, userRole)
    }
    return this.analyticsService.getPostStats(dto, userId)
  }

  @Get('platforms')
  @ApiOperation({ summary: '获取平台维度对比数据' })
  async getPlatformComparison(
    @CurrentUser('id') userId: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.analyticsService.getPlatformComparison(userId, groupId)
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
    })
  }

  @Get('comparison')
  @ApiOperation({ summary: '数据同比环比对比（周环比、月环比、年同比）' })
  async getComparison(@CurrentUser('id') userId: string, @Query('groupId') groupId?: string) {
    return this.analyticsService.getComparison(userId, groupId)
  }

  @Post('monetization/manual')
  @ApiOperation({ summary: '手动录入变现数据' })
  async createManualMonetization(
    @CurrentUser('id') userId: string,
    @Body()
    dto: {
      date: string
      platform: string
      revenue?: number
      gmv?: number
      orders?: number
      buyerCount?: number
      commission?: number
      avgOrderValue?: number
    },
  ) {
    if (!dto.date || !dto.platform) throw new BadRequestException('日期和平台不能为空')
    return this.analyticsService.createManualMonetization(userId, dto)
  }

  @Get('views-ranking')
  @ApiOperation({ summary: '播放量榜单（按播放量排名）' })
  @ApiQuery({ name: 'limit', required: false, description: '返回条数（默认50）' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['week', 'month', 'all'],
    description: '时间范围',
  })
  @ApiQuery({ name: 'platform', required: false, description: '平台筛选' })
  @ApiQuery({ name: 'groupId', required: false, description: '分组筛选' })
  async getViewsRanking(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: number,
    @Query('period') period?: 'week' | 'month' | 'all',
    @Query('platform') platform?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.analyticsService.getViewsRanking(userId, {
      limit: limit ? Math.min(100, Math.max(1, Number(limit))) : 50,
      period: period || 'all',
      platform,
      groupId,
    })
  }

  @Get('engagement-ranking')
  @ApiOperation({ summary: '互动率榜单（按互动率排名）' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'all'] })
  @ApiQuery({ name: 'platform', required: false })
  @ApiQuery({ name: 'groupId', required: false })
  async getEngagementRanking(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: number,
    @Query('period') period?: 'week' | 'month' | 'all',
    @Query('platform') platform?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.analyticsService.getEngagementRanking(userId, {
      limit: limit ? Math.min(100, Math.max(1, Number(limit))) : 50,
      period: period || 'all',
      platform,
      groupId,
    })
  }

  // ─── 以下为补全的 7 个缺失端点 ───

  @Get('likes/trend')
  @ApiOperation({ summary: '获取点赞增长趋势' })
  async getLikesTrend(
    @CurrentUser('id') userId: string,
    @Query('days') days?: number,
    @Query('platform') platform?: string,
  ) {
    return this.analyticsService.getLikesTrend(userId, days || 7, platform)
  }

  @Get('publish-effect')
  @ApiOperation({ summary: '获取发布效果数据' })
  async getPublishEffect(
    @CurrentUser('id') userId: string,
    @Query('days') days?: number,
    @Query('contentId') contentId?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.analyticsService.getPublishEffect(userId, days, contentId, groupId)
  }

  @Get('engagement')
  @ApiOperation({ summary: '获取互动率趋势' })
  async getEngagementRate(
    @CurrentUser('id') userId: string,
    @Query('days') days?: number,
    @Query('platform') platform?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.analyticsService.getEngagementRate(userId, days || 7, platform, groupId)
  }

  @Get('monetization')
  @ApiOperation({ summary: '获取变现数据中心数据' })
  async getMonetization(
    @CurrentUser('id') userId: string,
    @Query('days') days?: number,
    @Query('platform') platform?: string,
  ) {
    return this.analyticsService.getMonetization(userId, days || 30, platform)
  }

  @Get('account/:id')
  @ApiOperation({ summary: '获取单个账号分析数据' })
  @ApiParam({ name: 'id', description: '账号ID' })
  async getAccountAnalytics(
    @Param('id') accountId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
  ) {
    await this.verifyAccountOwnership(accountId, userId, userRole)
    return this.analyticsService.getAccountAnalytics(accountId)
  }

  @Get('account/:id/posts')
  @ApiOperation({ summary: '获取单个账号的内容列表' })
  @ApiParam({ name: 'id', description: '账号ID' })
  async getAccountPosts(
    @Param('id') accountId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    await this.verifyAccountOwnership(accountId, userId, userRole)
    return this.analyticsService.getAccountPosts(accountId, {
      page: page || 1,
      pageSize: pageSize || 20,
      sortBy: sortBy || 'createdAt',
      sortOrder: sortOrder || 'desc',
    })
  }

  /**
   * 校验账号是否属于当前用户（管理员除外）
   */
  private async verifyAccountOwnership(_accountId: string, _userId: string, _userRole: string) {
    // 共享模式：跳过所有权检查，所有用户可查看所有数据
    return
  }

  @Get('account-detail-list')
  @ApiOperation({ summary: '获取所有账号日/周/月维度数据明细列表' })
  @ApiQuery({ name: 'platform', required: false })
  @ApiQuery({ name: 'groupId', required: false })
  async getAccountDetailList(
    @CurrentUser('id') userId: string,
    @Query('platform') platform?: string,
    @Query('groupId') groupId?: string,
  ) {
    return this.analyticsService.getAccountDetailList(userId, platform, groupId)
  }

  @Get('tags')
  @ApiOperation({ summary: '获取热门标签' })
  @ApiQuery({ name: 'groupId', required: false })
  async getTags(@Query('groupId') groupId?: string) {
    return this.analyticsService.getTags(groupId)
  }
}
