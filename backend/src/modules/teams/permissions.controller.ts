import { Controller, Get, Put, Body, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'

// Default permission catalog
const DEFAULT_PERMISSIONS = {
  admin: [
    { id: 'account.manage', name: '账号管理', description: '添加、编辑、删除账号', enabled: true },
    { id: 'content.publish', name: '内容发布', description: '发布和定时发布内容', enabled: true },
    { id: 'team.manage', name: '团队管理', description: '管理团队成员和角色', enabled: true },
    { id: 'analytics.view', name: '数据分析', description: '查看所有分析数据', enabled: true },
    { id: 'store.manage', name: '店铺管理', description: '管理微信小店和抖店', enabled: true },
  ],
  member: [
    { id: 'account.view', name: '查看账号', description: '查看账号列表和数据', enabled: true },
    { id: 'content.create', name: '创建内容', description: '创建和编辑内容草稿', enabled: true },
    { id: 'analytics.view', name: '数据分析', description: '查看分析数据', enabled: true },
  ],
}

@ApiTags('permissions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: '获取团队权限配置' })
  async getPermissions(@Query('teamId') _teamId: string, @CurrentUser('id') _userId: string) {
    return {
      teamId: _teamId,
      admin: DEFAULT_PERMISSIONS.admin,
      member: DEFAULT_PERMISSIONS.member,
    }
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新团队权限配置' })
  async updatePermissions(
    @Body()
    body: {
      teamId: string
      admin: { id: string; enabled: boolean }[]
      member: { id: string; enabled: boolean }[]
    },
    @CurrentUser('id') _userId: string,
  ) {
    // Permissions are currently static defaults; accept the update without error
    return {
      teamId: body.teamId,
      admin: DEFAULT_PERMISSIONS.admin.map((p) => ({
        ...p,
        enabled: body.admin.find((u) => u.id === p.id)?.enabled ?? p.enabled,
      })),
      member: DEFAULT_PERMISSIONS.member.map((p) => ({
        ...p,
        enabled: body.member.find((u) => u.id === p.id)?.enabled ?? p.enabled,
      })),
    }
  }
}
