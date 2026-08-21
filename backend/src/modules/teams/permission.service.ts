import { ForbiddenException, Injectable } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

type PermissionRoleType = 'admin' | 'member'

const ADMIN_ROLES = new Set<UserRole>([UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN])

const DEFAULT_PERMISSIONS: Record<PermissionRoleType, Record<string, boolean>> = {
  admin: {
    view_accounts: true,
    manage_accounts: true,
    view_content: true,
    create_content: true,
    publish_content: true,
    view_analytics: true,
    export_data: true,
    manage_browser: true,
    manage_team: true,
    manage_permissions: false,
  },
  member: {
    view_accounts: true,
    manage_accounts: false,
    view_content: true,
    create_content: true,
    publish_content: false,
    view_analytics: true,
    export_data: false,
    manage_browser: false,
    manage_team: false,
    manage_permissions: false,
  },
}

@Injectable()
export class PermissionService {
  constructor(private prisma: PrismaService) {}

  async assertUserPermission(userId: string, permissionId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, organizationId: true },
    })
    if (!user) throw new ForbiddenException('User not found')
    if (ADMIN_ROLES.has(user.role)) return
    if (!user.organizationId) throw new ForbiddenException('No organization access')

    const roleType: PermissionRoleType = user.role === UserRole.MANAGER ? 'admin' : 'member'
    const teams = await this.prisma.team.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true },
    })

    const saved =
      teams.length > 0
        ? await this.prisma.teamPermission.findFirst({
            where: {
              teamId: { in: teams.map((team) => team.id) },
              roleType,
              permissionId,
            },
            orderBy: { updatedAt: 'desc' },
            select: { enabled: true },
          })
        : null

    if (saved?.enabled === true || (saved == null && DEFAULT_PERMISSIONS[roleType]?.[permissionId] === true)) return
    throw new ForbiddenException(`Permission denied: ${permissionId}`)
  }
}
