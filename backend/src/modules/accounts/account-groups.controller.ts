import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { IsString, IsOptional, IsInt } from 'class-validator';

class CreateGroupDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

class UpdateGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

@ApiTags('account-groups')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('account-groups')
export class AccountGroupsController {
  constructor(private prisma: PrismaService) {}

  @Post()
  @ApiOperation({ summary: '创建账号分组' })
  async create(@Body() dto: CreateGroupDto, @CurrentUser('id') userId: string) {
    return this.prisma.accountGroup.create({
      data: {
        name: dto.name,
        color: dto.color || '#409EFF',
        sortOrder: dto.sortOrder || 0,
        userId,
      },
    });
  }

  @Get()
  @ApiOperation({ summary: '获取所有分组（含账号数量）' })
  async findAll(@CurrentUser('id') userId: string) {
    return this.prisma.accountGroup.findMany({
      where: { userId },
      include: { _count: { select: { accounts: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新分组' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser('id') userId: string,
  ) {
    // 先验证归属
    const group = await this.prisma.accountGroup.findFirst({ where: { id, userId } });
    if (!group) {
      return { success: false, message: '分组不存在或无权操作' };
    }
    return this.prisma.accountGroup.update({
      where: { id },
      data: dto,
      include: { _count: { select: { accounts: true } } },
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除分组（不删除账号）' })
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    // 先把该分组下的账号解绑
    await this.prisma.account.updateMany({
      where: { groupId: id, userId },
      data: { groupId: null },
    });
    return this.prisma.accountGroup.deleteMany({ where: { id, userId } });
  }

  @Put(':id/accounts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '批量设置账号分组' })
  async setAccounts(
    @Param('id') groupId: string,
    @Body() body: { accountIds: string[] },
    @CurrentUser('id') userId: string,
  ) {
    await this.prisma.account.updateMany({
      where: { id: { in: body.accountIds }, userId },
      data: { groupId },
    });
    return { success: true, count: body.accountIds.length };
  }
}
