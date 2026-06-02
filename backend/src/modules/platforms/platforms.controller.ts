/**
 * 平台管理API控制器
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { PlatformsService } from './platforms.service'
import { OAuthService } from './oauth/oauth.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Public } from '../../common/decorators/public.decorator'
import {
  AuthorizePlatformDto,
  CollectDataDto,
  BatchCollectDto,
  PlatformFilterDto,
  ReportMetricsDto,
  ReportPostStatsDto,
} from './dto/platform.dto'

@ApiTags('platforms')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('platforms')
export class PlatformsController {
  constructor(
    private readonly platformsService: PlatformsService,
    private readonly oauthService: OAuthService,
  ) {}

  // ==================== 平台信息 ====================

  @Get()
  @ApiOperation({ summary: '获取支持的平台列表' })
  async getSupportedPlatforms() {
    return this.platformsService.getSupportedPlatforms()
  }

  @Get(':platform/info')
  @ApiOperation({ summary: '获取平台详细信息' })
  async getPlatformInfo(@Param('platform') platform: string) {
    return this.platformsService.getPlatformInfo(platform)
  }

  // ==================== OAuth授权 ====================

  @Post('authorize')
  @ApiOperation({ summary: '获取平台OAuth授权URL' })
  async getAuthorizeUrl(@Body() dto: AuthorizePlatformDto, @CurrentUser('id') userId: string) {
    const url = this.platformsService.getAuthorizeUrl(dto.platform, userId, dto.teamId)
    return { url, platform: dto.platform }
  }

  @Delete(':accountId/revoke')
  @ApiOperation({ summary: '解除平台授权' })
  @HttpCode(HttpStatus.OK)
  async revokeAuthorization(
    @Param('accountId') accountId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.platformsService.revokeAuthorization(accountId, userId)
    return { success: true, message: '授权已解除' }
  }

  // ==================== 已授权账号 ====================

  @Get('accounts')
  @ApiOperation({ summary: '获取已授权平台账号列表' })
  @ApiQuery({ name: 'platform', required: false })
  @ApiQuery({ name: 'teamId', required: false })
  @ApiQuery({ name: 'skip', required: false })
  @ApiQuery({ name: 'take', required: false })
  async getAuthorizedAccounts(
    @Query() filter: PlatformFilterDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.platformsService.getAuthorizedAccounts({
      userId,
      ...filter,
      skip: filter.skip || 0,
    })
  }

  // ==================== 数据采集 ====================

  @Post('collect')
  @ApiOperation({ summary: '采集单个账号数据' })
  async collectAccountData(@Body() dto: CollectDataDto) {
    return this.platformsService.collectAccountData(dto.accountId, dto.type || 'daily')
  }

  @Post('collect/batch')
  @ApiOperation({ summary: '批量采集数据' })
  async batchCollectData(@Body() dto: BatchCollectDto) {
    return this.platformsService.batchCollectData(dto.accountIds, dto.type || 'daily')
  }

  // ==================== 伴侣数据上报 ====================

  @Post('report-metrics')
  @Public()
  @ApiOperation({ summary: '桌面伴侣上报账号指标' })
  @HttpCode(HttpStatus.OK)
  async reportMetrics(@Body() dto: ReportMetricsDto) {
    return this.platformsService.reportMetrics(dto)
  }

  @Post('report-post-stats')
  @Public()
  @ApiOperation({ summary: '桌面伴侣上报视频/帖子数据' })
  @HttpCode(HttpStatus.OK)
  async reportPostStats(@Body() dto: ReportPostStatsDto) {
    return this.platformsService.reportPostStats(dto)
  }

  // ==================== Token管理 ====================

  @Post(':accountId/refresh-token')
  @ApiOperation({ summary: '刷新平台Token' })
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Param('accountId') accountId: string) {
    const success = await this.platformsService.refreshToken(accountId)
    return {
      success,
      message: success ? 'Token刷新成功' : 'Token刷新失败',
    }
  }

  @Post('refresh-expiring-tokens')
  @ApiOperation({ summary: '批量刷新即将过期的Token' })
  async refreshExpiringTokens() {
    return this.platformsService.refreshExpiringTokens()
  }
}
