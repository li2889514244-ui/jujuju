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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Platform } from '@prisma/client';

@ApiTags('accounts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @ApiOperation({ summary: '创建平台账号' })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 409, description: '账号已存在' })
  async create(
    @Body() dto: CreateAccountDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.accountsService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: '获取账号列表' })
  @ApiQuery({ name: 'platform', required: false, enum: Platform })
  @ApiQuery({ name: 'teamId', required: false })
  @ApiQuery({ name: 'page', required: false, description: '页码（从1开始）' })
  @ApiQuery({ name: 'limit', required: false, description: '每页条数（最大100）' })
  async findAll(
    @Query('platform') platform?: Platform,
    @Query('teamId') teamId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser('id') userId?: string,
  ) {
    const pageNum = Math.max(1, page || 1);
    const limitNum = Math.min(100, Math.max(1, limit || 20));
    const skip = (pageNum - 1) * limitNum;
    return this.accountsService.findAll({ userId, teamId, platform, skip, take: limitNum });
  }

  @Get(':id')
  @ApiOperation({ summary: '获取账号详情' })
  @ApiResponse({ status: 404, description: '账号不存在' })
  async findOne(@Param('id') id: string) {
    return this.accountsService.findById(id);
  }

  @Get(':id/cookies')
  @ApiOperation({ summary: '获取账号Cookie（解密）' })
  @ApiResponse({ status: 403, description: '无权限' })
  async getCookies(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.accountsService.getCookies(id, userId);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新账号信息' })
  @ApiResponse({ status: 404, description: '账号不存在' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.accountsService.update(id, dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除账号' })
  @ApiResponse({ status: 404, description: '账号不存在' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.accountsService.remove(id, userId);
  }
}
