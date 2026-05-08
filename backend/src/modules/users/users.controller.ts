import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

class UpdateUserDto {
  @ApiPropertyOptional({ description: '用户名' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: '手机号' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: '头像URL' })
  @IsOptional()
  @IsString()
  avatar?: string;
}

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: '获取用户列表（管理员）' })
  @ApiQuery({ name: 'page', required: false, description: '页码（从1开始）' })
  @ApiQuery({ name: 'limit', required: false, description: '每页条数（最大100）' })
  @ApiQuery({ name: 'search', required: false, description: '搜索关键词' })
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    const pageNum = Math.max(1, page || 1);
    const limitNum = Math.min(100, Math.max(1, limit || 20));
    const skip = (pageNum - 1) * limitNum;

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    return this.usersService.findAll({ skip, take: limitNum, where });
  }

  @Get('me')
  @ApiOperation({ summary: '获取当前用户信息' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId);
  }

  /**
   * #5 修复: 普通用户只能查看自己，管理员/所有者可查看他人
   */
  @Get(':id')
  @ApiOperation({ summary: '获取指定用户详情' })
  @ApiResponse({ status: 403, description: '无权查看他人信息' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser('id') currentUserId: string,
    @CurrentUser('role') currentRole: Role,
  ) {
    // 普通用户只能查看自己
    if (id !== currentUserId && !['OWNER', 'ADMIN'].includes(currentRole)) {
      throw new ForbiddenException('无权查看其他用户信息');
    }
    return this.usersService.findById(id);
  }

  @Put('me')
  @ApiOperation({ summary: '更新当前用户信息' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(userId, dto);
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  @ApiOperation({ summary: '删除用户（软删除，管理员）' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
