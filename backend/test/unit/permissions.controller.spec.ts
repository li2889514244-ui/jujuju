import { ForbiddenException } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { PermissionsController } from '../../src/modules/teams/permissions.controller'

describe('PermissionsController', () => {
  function createController() {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          role: UserRole.SUPER_ADMIN,
          organizationId: 'org-1',
        }),
      },
      team: {
        findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-1' }),
      },
      teamMember: {
        findUnique: jest.fn(),
      },
      teamPermission: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn((args) => Promise.resolve(args.create)),
      },
      $transaction: jest.fn((operations) => Promise.all(operations)),
    }

    return {
      controller: new PermissionsController(prisma as any),
      prisma,
    }
  }

  it('returns frontend-compatible default permission ids when no saved settings exist', async () => {
    const { controller } = createController()

    const result = await controller.getPermissions('team-1', 'user-1')

    expect(result.admin.map((permission) => permission.id)).toContain('manage_accounts')
    expect(result.admin.map((permission) => permission.id)).toContain('manage_permissions')
    expect(result.member.map((permission) => permission.id)).toContain('view_accounts')
    expect(result.admin.map((permission) => permission.id)).not.toContain('account.manage')
  })

  it('persists submitted permission settings and reads back saved values', async () => {
    const { controller, prisma } = createController()
    prisma.teamPermission.findMany.mockResolvedValue([
      { roleType: 'admin', permissionId: 'manage_permissions', enabled: true },
      { roleType: 'member', permissionId: 'export_data', enabled: true },
    ])

    const result = await controller.updatePermissions(
      {
        teamId: 'team-1',
        admin: [{ id: 'manage_permissions', enabled: true }],
        member: [{ id: 'export_data', enabled: true }],
      },
      'user-1',
    )

    expect(prisma.teamPermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teamId_roleType_permissionId: {
            teamId: 'team-1',
            roleType: 'admin',
            permissionId: 'manage_permissions',
          },
        },
      }),
    )
    expect(result.admin.find((permission) => permission.id === 'manage_permissions')?.enabled).toBe(
      true,
    )
    expect(result.member.find((permission) => permission.id === 'export_data')?.enabled).toBe(true)
  })

  it('rejects permission updates from non-admin team members', async () => {
    const { controller, prisma } = createController()
    prisma.user.findUnique.mockResolvedValue({ role: UserRole.MEMBER, organizationId: 'org-1' })
    prisma.teamMember.findUnique.mockResolvedValue({ role: UserRole.MEMBER })

    await expect(
      controller.updatePermissions(
        {
          teamId: 'team-1',
          admin: [{ id: 'manage_permissions', enabled: true }],
          member: [],
        },
        'user-1',
      ),
    ).rejects.toThrow(ForbiddenException)
    expect(prisma.teamPermission.upsert).not.toHaveBeenCalled()
  })
})
