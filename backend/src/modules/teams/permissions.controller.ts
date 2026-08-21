import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { UserRole } from '@prisma/client'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

const DEFAULT_PERMISSIONS = {
  admin: [
    { id: 'manage_accounts', name: '管理账号', description: '添加、编辑、删除账号', enabled: true },
    { id: 'view_content', name: '查看内容', description: '查看团队内所有内容', enabled: true },
    { id: 'create_content', name: '创建内容', description: '创建和编辑内容', enabled: true },
    { id: 'publish_content', name: '发布内容', description: '发布内容到各平台', enabled: true },
    { id: 'view_analytics', name: '查看数据', description: '查看数据分析报告', enabled: true },
    { id: 'export_data', name: '导出数据', description: '导出分析报告和数据', enabled: true },
    { id: 'manage_browser', name: '管理浏览器', description: '管理内置浏览器会话', enabled: true },
    { id: 'manage_team', name: '管理团队', description: '邀请、移除成员、修改角色', enabled: true },
    { id: 'manage_permissions', name: '管理权限', description: '修改团队权限设置', enabled: false },
  ],
  member: [
    { id: 'view_accounts', name: '查看账号', description: '查看团队内所有账号信息', enabled: true },
    { id: 'manage_accounts', name: '管理账号', description: '添加、编辑、删除账号', enabled: false },
    { id: 'view_content', name: '查看内容', description: '查看团队内所有内容', enabled: true },
    { id: 'create_content', name: '创建内容', description: '创建和编辑内容', enabled: true },
    { id: 'publish_content', name: '发布内容', description: '发布内容到各平台', enabled: false },
    { id: 'view_analytics', name: '查看数据', description: '查看数据分析报告', enabled: true },
    { id: 'export_data', name: '导出数据', description: '导出分析报告和数据', enabled: false },
    { id: 'manage_browser', name: '管理浏览器', description: '管理内置浏览器会话', enabled: false },
    { id: 'manage_team', name: '管理团队', description: '邀请、移除成员、修改角色', enabled: false },
    { id: 'manage_permissions', name: '管理权限', description: '修改团队权限设置', enabled: false },
  ],
}

type RoleType = keyof typeof DEFAULT_PERMISSIONS
type PermissionUpdate = { id: string; enabled: boolean }
type StoredPermission = { roleType: string; permissionId: string; enabled: boolean }

@ApiTags('permissions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: '获取团队权限配置' })
  async getPermissions(@Query('teamId') teamId: string, @CurrentUser('id') userId: string) {
    await this.assertTeamAccess(teamId, userId)
    const stored = await this.prisma.teamPermission.findMany({ where: { teamId } })

    return {
      teamId,
      admin: this.mergePermissions('admin', stored),
      member: this.mergePermissions('member', stored),
    }
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新团队权限配置' })
  async updatePermissions(
    @Body()
    body: {
      teamId: string
      admin?: PermissionUpdate[]
      member?: PermissionUpdate[]
    },
    @CurrentUser('id') userId: string,
  ) {
    await this.assertTeamAdmin(body.teamId, userId)
    const admin = this.normalizeUpdates('admin', body.admin)
    const member = this.normalizeUpdates('member', body.member)

    await this.prisma.$transaction([
      ...admin.map((permission) => this.upsertPermission(body.teamId, 'admin', permission)),
      ...member.map((permission) => this.upsertPermission(body.teamId, 'member', permission)),
    ])

    const stored = await this.prisma.teamPermission.findMany({ where: { teamId: body.teamId } })
    return {
      teamId: body.teamId,
      admin: this.mergePermissions('admin', stored),
      member: this.mergePermissions('member', stored),
    }
  }

  private mergePermissions(roleType: RoleType, stored: StoredPermission[]) {
    return DEFAULT_PERMISSIONS[roleType].map((permission) => {
      const saved = stored.find((item) => item.roleType === roleType && item.permissionId === permission.id)
      return { ...permission, enabled: saved?.enabled ?? permission.enabled }
    })
  }

  private normalizeUpdates(roleType: RoleType, updates: PermissionUpdate[] | undefined) {
    const allowed = new Set(DEFAULT_PERMISSIONS[roleType].map((permission) => permission.id))
    return (updates ?? []).map((item) => {
      if (!allowed.has(item.id)) {
        throw new BadRequestException(`Unknown ${roleType} permission: ${item.id}`)
      }
      return { id: item.id, enabled: Boolean(item.enabled) }
    })
  }

  private upsertPermission(teamId: string, roleType: RoleType, permission: PermissionUpdate) {
    return this.prisma.teamPermission.upsert({
      where: {
        teamId_roleType_permissionId: {
          teamId,
          roleType,
          permissionId: permission.id,
        },
      },
      update: { enabled: permission.enabled },
      create: {
        teamId,
        roleType,
        permissionId: permission.id,
        enabled: permission.enabled,
      },
    })
  }

  private async assertTeamAccess(teamId: string, userId: string) {
    if (!teamId) throw new BadRequestException('teamId is required')

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, organizationId: true },
    })
    if (!user) throw new ForbiddenException('User not found')
    if (user.role === UserRole.SUPER_ADMIN) return

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { organizationId: true },
    })
    if (!team) throw new NotFoundException('Team not found')
    if (team.organizationId !== user.organizationId) {
      throw new ForbiddenException('No access to this team')
    }
  }

  private async assertTeamAdmin(teamId: string, userId: string) {
    await this.assertTeamAccess(teamId, userId)

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })
    if (user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.OWNER || user?.role === UserRole.ADMIN) return

    const member = await this.prisma.teamMember.findUnique({
      where: { userId_teamId: { userId, teamId } },
      select: { role: true },
    })
    if (member?.role === UserRole.OWNER || member?.role === UserRole.ADMIN) return
    throw new ForbiddenException('Only team admins can update permissions')
  }
}
