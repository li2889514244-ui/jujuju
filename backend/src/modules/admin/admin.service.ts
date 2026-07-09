import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(private prisma: PrismaService) {}

  // ==================== 组织管理 ====================

  async listOrganizations(params: { skip?: number; take?: number; search?: string }) {
    const { skip = 0, take = 20, search } = params
    const where = search
      ? { OR: [{ name: { contains: search } }, { status: { equals: search as any } }] }
      : {}

    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { users: true } },
        },
      }),
      this.prisma.organization.count({ where }),
    ])

    return { organizations, total, skip, take }
  }

  async createOrganization(dto: {
    name: string
    maxAccounts?: number
    maxUsers?: number
    expiresAt?: string
  }) {
    const org = await this.prisma.organization.create({
      data: {
        name: dto.name,
        maxAccounts: dto.maxAccounts ?? 20,
        maxUsers: dto.maxUsers ?? 10,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    })
    this.logger.log(`组织创建成功: ${org.name} (${org.id})`)
    return org
  }

  async updateOrganization(
    id: string,
    dto: {
      name?: string
      status?: string
      maxAccounts?: number
      maxUsers?: number
      expiresAt?: string | null
    },
  ) {
    const org = await this.prisma.organization.findUnique({ where: { id } })
    if (!org) throw new NotFoundException('组织不存在')

    const data: any = {}
    if (dto.name !== undefined) data.name = dto.name
    if (dto.status !== undefined) data.status = dto.status as any
    if (dto.maxAccounts !== undefined) data.maxAccounts = dto.maxAccounts
    if (dto.maxUsers !== undefined) data.maxUsers = dto.maxUsers
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null
    }

    return this.prisma.organization.update({ where: { id }, data })
  }

  async deleteOrganization(id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id } })
    if (!org) throw new NotFoundException('组织不存在')

    // 冻结而非删除（保留数据）
    const frozen = await this.prisma.organization.update({
      where: { id },
      data: { status: 'DISABLED' },
    })
    this.logger.log(`组织已冻结: ${org.name} (${id})`)
    return { success: true, status: frozen.status }
  }

  async getOrganizationStats(id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id } })
    if (!org) throw new NotFoundException('组织不存在')

    const [userCount, accountCount] = await Promise.all([
      this.prisma.user.count({ where: { organizationId: id } }),
      this.prisma.account.count({ where: { organizationId: id } }),
    ])

    return {
      organization: org,
      usage: {
        users: userCount,
        maxUsers: org.maxUsers,
        accounts: accountCount,
        maxAccounts: org.maxAccounts,
      },
    }
  }

  // ==================== 用户管理 ====================

  async listUsers(params: {
    skip?: number
    take?: number
    search?: string
    organizationId?: string
  }) {
    const { skip = 0, take = 20, search, organizationId } = params
    const where: any = {}
    if (organizationId) where.organizationId = organizationId
    if (search) {
      where.OR = [{ email: { contains: search } }, { name: { contains: search } }]
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          organizationId: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ])

    return { users, total, skip, take }
  }

  async createUserInOrganization(
    organizationId: string,
    dto: {
      email: string
      name: string
      password: string
      role?: string
    },
  ) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } })
    if (!org) throw new NotFoundException('组织不存在')
    if (org.status === 'DISABLED') {
      throw new BadRequestException('组织已被冻结，无法创建用户')
    }

    // 检查用户数限制
    const userCount = await this.prisma.user.count({ where: { organizationId } })
    if (userCount >= org.maxUsers) {
      throw new ForbiddenException(`用户数已达上限 (${org.maxUsers})`)
    }

    // 检查邮箱是否已存在
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    })
    if (existing) {
      throw new BadRequestException('邮箱已被注册')
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10)
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: hashedPassword,
        role: (dto.role as any) || 'MEMBER',
        organizationId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
      },
    })

    this.logger.log(`超管创建用户: ${user.email} (组织: ${org.name})`)
    return user
  }

  async updateUser(
    userId: string,
    dto: {
      role?: string
      status?: string
      organizationId?: string
      name?: string
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('用户不存在')

    const data: any = {}
    if (dto.role !== undefined) data.role = dto.role
    if (dto.status !== undefined) data.status = dto.status
    if (dto.organizationId !== undefined) data.organizationId = dto.organizationId
    if (dto.name !== undefined) data.name = dto.name

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        organizationId: true,
      },
    })
  }

  // ==================== 系统健康 ====================

  async getSystemHealth() {
    const [orgCount, activeOrgCount, userCount, activeUserCount, accountCount] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.organization.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.account.count(),
    ])

    return {
      organizations: { total: orgCount, active: activeOrgCount },
      users: { total: userCount, active: activeUserCount },
      accounts: { total: accountCount },
    }
  }
}
