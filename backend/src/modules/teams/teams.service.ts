import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateTeamDto } from './dto/create-team.dto'
import { InviteMemberDto } from './dto/invite-member.dto'
import { Role } from '../../common/prisma-enums'

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name)

  constructor(private prisma: PrismaService) {}

  /**
   * 创建团队
   */
  async create(dto: CreateTeamDto, userId: string) {
    // 获取用户的组织ID
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    })

    const organizationId = dto.organizationId || user?.organizationId
    if (!organizationId) {
      throw new ForbiddenException('用户未关联任何组织，无法创建团队')
    }

    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        organizationId,
      },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
    })

    this.logger.log(`团队创建成功: ${team.name} (${team.id})`)
    return team
  }

  /**
   * 获取团队列表
   */
  async findAll(organizationId?: string) {
    const where = organizationId ? { organizationId } : {}
    return this.prisma.team.findMany({
      where,
      include: {
        organization: {
          select: { id: true, name: true },
        },
        accounts: {
          select: {
            id: true,
            platform: true,
            nickname: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * 获取团队详情
   */
  async findById(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true, plan: true },
        },
        accounts: {
          select: {
            id: true,
            platform: true,
            nickname: true,
            avatar: true,
            followers: true,
            likes: true,
            status: true,
            owner: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    })

    if (!team) {
      throw new NotFoundException('团队不存在')
    }

    return team
  }

  /**
   * 邀请成员到组织
   */
  async inviteMember(dto: InviteMemberDto, inviterId: string) {
    // 查找被邀请人
    const invitee = await this.prisma.user.findUnique({
      where: { email: dto.email },
    })

    if (!invitee) {
      throw new NotFoundException('被邀请的用户不存在')
    }

    // 获取邀请人的组织
    const inviter = await this.prisma.user.findUnique({
      where: { id: inviterId },
      select: { organizationId: true, role: true },
    })

    if (!inviter?.organizationId) {
      throw new ForbiddenException('邀请人未关联任何组织')
    }

    // 检查权限：只有 OWNER、ADMIN、MANAGER 可以邀请
    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(inviter.role)) {
      throw new ForbiddenException('无权邀请成员')
    }

    // 检查被邀请人是否已在同一组织
    if (invitee.organizationId === inviter.organizationId) {
      throw new ConflictException('该用户已在当前组织中')
    }

    // 将被邀请人加入组织并设置角色
    const updatedUser = await this.prisma.user.update({
      where: { id: invitee.id },
      data: {
        organizationId: inviter.organizationId,
        role: dto.role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organization: {
          select: { id: true, name: true },
        },
      },
    })

    this.logger.log(
      `成员邀请成功: ${dto.email} 加入组织 ${inviter.organizationId}，角色: ${dto.role}`,
    )

    return updatedUser
  }

  /**
   * 更新成员角色
   * #6 修复: 校验不能设置比自己更高的角色
   */
  async updateMemberRole(
    organizationId: string,
    memberId: string,
    newRole: Role,
    operatorId: string,
  ) {
    // 验证操作者权限
    const operator = await this.prisma.user.findUnique({
      where: { id: operatorId },
    })

    if (!operator || !['OWNER', 'ADMIN'].includes(operator.role)) {
      throw new ForbiddenException('无权修改成员角色')
    }

    // 不能修改自己的角色
    if (memberId === operatorId) {
      throw new ForbiddenException('不能修改自己的角色')
    }

    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId },
    })

    if (!member) {
      throw new NotFoundException('成员不存在')
    }

    // #6 修复: 角色等级校验 — 不能设置比自己更高的角色
    const roleHierarchy: Record<string, number> = {
      OWNER: 5,
      ADMIN: 4,
      MANAGER: 3,
      MEMBER: 2,
      VIEWER: 1,
    }
    const operatorLevel = roleHierarchy[operator.role] || 0
    const targetLevel = roleHierarchy[newRole] || 0
    if (targetLevel >= operatorLevel) {
      throw new ForbiddenException('不能设置比自己更高或同级的角色')
    }

    return this.prisma.user.update({
      where: { id: memberId },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    })
  }

  /**
   * 移除成员（从组织中移除）
   */
  async removeMember(organizationId: string, memberId: string, operatorId: string) {
    const operator = await this.prisma.user.findUnique({
      where: { id: operatorId },
    })

    if (!operator || !['OWNER', 'ADMIN'].includes(operator.role)) {
      throw new ForbiddenException('无权移除成员')
    }

    if (memberId === operatorId) {
      throw new ForbiddenException('不能移除自己')
    }

    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId },
    })

    if (!member) {
      throw new NotFoundException('成员不存在')
    }

    if (member.role === 'OWNER') {
      throw new ForbiddenException('不能移除组织所有者')
    }

    return this.prisma.user.update({
      where: { id: memberId },
      data: {
        organizationId: null,
        role: 'MEMBER',
      },
    })
  }

  /**
   * 获取组织成员列表
   */
  async getMembers(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
  }
}
