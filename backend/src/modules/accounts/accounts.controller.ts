import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { AccountsService } from './accounts.service'
import { CreateAccountDto } from './dto/create-account.dto'
import { UpdateAccountDto } from './dto/update-account.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Platform } from '../../common/prisma-enums'
import { PrismaService } from '../../prisma/prisma.service'
import { CookieManager } from '../uploader/cookie-manager'
import { OwnershipHelper } from '../../common/utils/ownership.helper'

@ApiTags('accounts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly prisma: PrismaService,
    private readonly cookieManager: CookieManager,
  ) {}

  @Post()
  async create(@Body() dto: CreateAccountDto, @CurrentUser('id') userId: string) {
    return this.accountsService.create(dto, userId)
  }

  @Post('bulk-move')
  @ApiOperation({ summary: '批量移动账号到分组' })
  async bulkMove(
    @Body() dto: { ids: string[]; groupId: string },
    @CurrentUser('id') _userId: string,
  ) {
    const { ids, groupId } = dto
    await this.prisma.account.updateMany({
      where: { id: { in: ids } },
      data: { groupId: groupId || null },
    })
    return { success: true, count: ids.length }
  }

  @Get()
  @ApiQuery({ name: 'platform', required: false, enum: Platform })
  @ApiQuery({ name: 'teamId', required: false })
  @ApiQuery({ name: 'groupId', required: false })
  @ApiQuery({ name: 'group', required: false, description: 'groupId 别名（前端兼容）' })
  @ApiQuery({ name: 'keyword', required: false, description: '搜索账号名称' })
  async findAll(
    @Query('platform') platform?: Platform,
    @Query('teamId') teamId?: string,
    @Query('groupId') groupId?: string,
    @Query('group') group?: string,
    @Query('keyword') keyword?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('pageSize') pageSize?: number,
    @CurrentUser('id') userId?: string,
  ) {
    const pageNum = Math.max(1, Number(page) || 1)
    // 兼容前端 pageSize 参数
    const limitNum = Math.min(100, Math.max(1, Number(limit || pageSize) || 20))
    const skip = (pageNum - 1) * limitNum
    // 兼容前端 group 参数
    const effectiveGroupId = groupId || group
    return this.accountsService.findAll({
      userId,
      teamId,
      groupId: effectiveGroupId,
      platform,
      keyword,
      skip,
      take: limitNum,
    })
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.accountsService.findById(id)
  }

  @Get(':id/cookies')
  async getCookies(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.accountsService.getCookies(id, userId)
  }

  @Post(':id/cookies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '上传/更新账号 Cookie（由桌面伴侣调用）' })
  async uploadCookies(
    @Param('id') id: string,
    @Body() body: { cookies: any[] },
    @CurrentUser('id') userId: string,
  ) {
    const account = await this.prisma.account.findUnique({ where: { id } })
    if (!account) {
      throw new NotFoundException('账号不存在')
    }
    await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号')

    if (!body.cookies || !Array.isArray(body.cookies) || body.cookies.length === 0) {
      return { success: false, message: 'Cookie 数据为空' }
    }

    await this.cookieManager.saveCookies(id, body.cookies)
    return { success: true, count: body.cookies.length }
  }

  @Post(':id/check-cookie')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '检查账号 Cookie 状态' })
  async checkCookie(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } })
    if (!account) throw new NotFoundException('账号不存在')
    await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号')

    const cookies = await this.accountsService.getCookies(id, userId)
    const hasCookies = Array.isArray(cookies) && cookies.length > 0
    return {
      status: hasCookies ? 'valid' : 'missing',
      count: hasCookies ? cookies.length : 0,
    }
  }

  @Post(':id/refresh-cookie')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '刷新账号 Cookie（提示用户重新通过桌面伴侣上传）' })
  async refreshCookie(@Param('id') id: string, @CurrentUser('id') userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } })
    if (!account) throw new NotFoundException('账号不存在')
    await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号')

    return {
      success: true,
      message: '请通过桌面伴侣重新采集 Cookie',
      accountId: id,
    }
  }

  @Get(':id/history')
  @ApiOperation({ summary: '获取账号历史数据' })
  async getHistory(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @CurrentUser('id') userId?: string,
  ) {
    const pageNum = Math.max(1, Number(page) || 1)
    const limitNum = Math.min(100, Math.max(1, Number(pageSize) || 20))
    const skip = (pageNum - 1) * limitNum

    const [records, total] = await Promise.all([
      this.prisma.dailyStats.findMany({
        where: { accountId: id },
        skip,
        take: limitNum,
        orderBy: { date: 'desc' },
      }),
      this.prisma.dailyStats.count({ where: { accountId: id } }),
    ])

    return { records, total, skip, take: limitNum }
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.accountsService.update(id, dto, userId)
  }

  @Put(':id/move-to-group')
  @HttpCode(HttpStatus.OK)
  async moveToGroup(
    @Param('id') id: string,
    @Body() body: { groupId: string | null },
    @CurrentUser('id') userId: string,
  ) {
    return this.accountsService.moveToGroup(id, body.groupId, userId)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.accountsService.remove(id, userId)
  }
}
