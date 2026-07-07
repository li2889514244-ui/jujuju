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
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { UsersService } from './users.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { IsOptional, IsString } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Role } from '../../common/prisma-enums'
import { PrismaService } from '../../prisma/prisma.service'

class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  phone?: string

  @IsOptional()
  @IsString()
  avatar?: string
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
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    const pageNum = Math.max(1, page || 1)
    const limitNum = Math.min(100, Math.max(1, limit || 20))
    const skip = (pageNum - 1) * limitNum

    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}

    return this.usersService.findAll({ skip, take: limitNum, where })
  }

  @Get('me')
  async getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.findById(userId)
  }

  /**
   * #5 修复: 普通用户只能查看自己，管理员/所有者可查看他人
   */
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser('id') currentUserId: string,
    @CurrentUser('role') currentRole: Role,
  ) {
    // 普通用户只能查看自己
    if (id !== currentUserId && !['OWNER', 'ADMIN'].includes(currentRole)) {
      throw new ForbiddenException('无权查看其他用户信息')
    }
    return this.usersService.findById(id)
  }

  @Put('me')
  async updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(userId, dto)
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN)
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id)
  }
}
