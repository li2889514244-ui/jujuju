import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { Role } from '../../common/prisma-enums'
import { AdminService } from './admin.service'

@ApiTags('admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ==================== 组织管理 ====================

  @Get('organizations')
  @ApiOperation({ summary: '获取组织列表（分页、搜索）' })
  async listOrganizations(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listOrganizations({
      skip: skip ? parseInt(skip) : 0,
      take: take ? parseInt(take) : 20,
      search,
    })
  }

  @Post('organizations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建组织' })
  async createOrganization(
    @Body()
    dto: {
      name: string
      maxAccounts?: number
      maxUsers?: number
      expiresAt?: string
    },
  ) {
    return this.adminService.createOrganization(dto)
  }

  @Get('organizations/:id')
  @ApiOperation({ summary: '获取组织详情（含用量统计）' })
  async getOrganizationStats(@Param('id') id: string) {
    return this.adminService.getOrganizationStats(id)
  }

  @Put('organizations/:id')
  @ApiOperation({ summary: '更新组织（名称、限额、状态）' })
  async updateOrganization(
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string
      status?: string
      maxAccounts?: number
      maxUsers?: number
      expiresAt?: string | null
    },
  ) {
    return this.adminService.updateOrganization(id, dto)
  }

  @Delete('organizations/:id')
  @ApiOperation({ summary: '冻结组织（软删除）' })
  async deleteOrganization(@Param('id') id: string) {
    return this.adminService.deleteOrganization(id)
  }

  @Post('organizations/:id/users')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '在组织下创建用户' })
  async createUserInOrganization(
    @Param('id') organizationId: string,
    @Body()
    dto: {
      email: string
      name: string
      password: string
      role?: string
    },
  ) {
    return this.adminService.createUserInOrganization(organizationId, dto)
  }

  // ==================== 用户管理 ====================

  @Get('users')
  @ApiOperation({ summary: '全局用户列表' })
  async listUsers(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('search') search?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.adminService.listUsers({
      skip: skip ? parseInt(skip) : 0,
      take: take ? parseInt(take) : 20,
      search,
      organizationId,
    })
  }

  @Put('users/:id')
  @ApiOperation({ summary: '修改用户（角色、状态、所属组织）' })
  async updateUser(
    @Param('id') id: string,
    @Body()
    dto: {
      role?: string
      status?: string
      organizationId?: string
      name?: string
    },
  ) {
    return this.adminService.updateUser(id, dto)
  }

  // ==================== 系统健康 ====================

  @Get('system/health')
  @ApiOperation({ summary: '系统健康看板' })
  async getSystemHealth() {
    return this.adminService.getSystemHealth()
  }
}
