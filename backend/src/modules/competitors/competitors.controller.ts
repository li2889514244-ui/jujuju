import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CompetitorsService } from './competitors.service'
import { Platform } from '../../common/prisma-enums'

@ApiTags('competitors')
@Controller('competitors')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class CompetitorsController {
  constructor(private readonly competitorsService: CompetitorsService) {}

  @Post()
  @ApiOperation({ summary: '添加竞品账号' })
  async create(
    @CurrentUser('id') userId: string,
    @Body()
    dto: {
      platform: Platform
      platformUserId: string
      nickname: string
      avatar?: string
      bio?: string
      note?: string
    },
  ) {
    return this.competitorsService.create({ ...dto, userId })
  }

  @Get()
  @ApiOperation({ summary: '获取竞品列表' })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('platform') platform?: Platform,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.competitorsService.findAll(userId, {
      platform,
      skip: skip ? parseInt(skip) : undefined,
      take: take ? parseInt(take) : undefined,
    })
  }

  @Get('compare')
  @ApiOperation({ summary: '竞品数据对比' })
  async compare(
    @CurrentUser('id') userId: string,
    @Query('ids') ids: string,
    @Query('days') days?: string,
  ) {
    const competitorIds = ids.split(',')
    return this.competitorsService.compare(userId, competitorIds, days ? parseInt(days) : 7)
  }

  @Get(':id')
  @ApiOperation({ summary: '获取竞品详情' })
  async findById(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.competitorsService.findById(id, userId)
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除竞品' })
  async remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.competitorsService.remove(id, userId)
  }
}
