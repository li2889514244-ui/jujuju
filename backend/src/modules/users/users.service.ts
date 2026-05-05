import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 获取用户列表（分页）
   */
  async findAll(params: {
    skip?: number;
    take?: number;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }) {
    const { skip = 0, take = 20, where, orderBy } = params;
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take,
        where,
        orderBy: orderBy || { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          avatar: true,
          role: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          organization: {
            select: { id: true, name: true, plan: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, skip, take };
  }

  /**
   * 根据ID获取用户详情
   */
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        organization: {
          select: { id: true, name: true, plan: true, status: true },
        },
        accounts: {
          select: {
            id: true,
            platform: true,
            nickname: true,
            avatar: true,
            followers: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  /**
   * 更新用户信息
   */
  async update(id: string, data: Prisma.UserUpdateInput) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  /**
   * 删除用户（软删除 - 设为INACTIVE）
   */
  async remove(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return this.prisma.user.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
  }

  /**
   * 根据组织ID获取用户列表
   */
  async findByOrganization(organizationId: string) {
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
    });
  }
}
