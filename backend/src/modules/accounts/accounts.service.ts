import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Platform } from '../../common/prisma-enums'
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { OwnershipHelper } from '../../common/utils/ownership.helper';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);
  private readonly encryptionKey: string;

  constructor(private prisma: PrismaService) {
    const key = process.env.COOKIE_ENCRYPTION_KEY;
    if (!key || key.length < 32) {
      throw new Error(
        'FATAL: COOKIE_ENCRYPTION_KEY environment variable is required and must be at least 32 characters.',
      );
    }
    this.encryptionKey = key;
  }

  /**
   * 修复: 加密Cookie — 使用 aes-256-gcm，每条记录独立随机IV
   */
  private encryptCookie(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + authTag + ':' + encrypted;
  }

  /**
   * 修复: 解密Cookie — 兼容旧 CBC 格式
   */
  private decryptCookie(text: string): string {
    const parts = text.split(':');
    if (parts.length === 2) {
      // 兼容旧的 CBC 格式
      this.logger.warn('检测到旧版 CBC 加密格式，建议重新保存 Cookie 以迁移到 GCM');
      const [ivHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    // 新的 GCM 格式: iv:authTag:encrypted
    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * 创建平台账号
   */
  async create(dto: CreateAccountDto, userId: string) {
    // 检查是否已存在
    const existing = await this.prisma.account.findUnique({
      where: {
        platform_platformUserId: {
          platform: dto.platform,
          platformUserId: dto.platformUserId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('平台账号已存在');
    }

    // 加密Cookie
    const encryptedCookies = dto.cookies
      ? this.encryptCookie(dto.cookies)
      : null;

    const account = await this.prisma.account.create({
      data: {
        platform: dto.platform,
        platformUserId: dto.platformUserId,
        nickname: dto.nickname,
        avatar: dto.avatar,
        bio: dto.bio,
        cookies: encryptedCookies,
        proxyConfig: dto.proxyConfig ? JSON.stringify(dto.proxyConfig) : undefined,
        teamId: dto.teamId,
        userId,
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
        },
      },
    });

    this.logger.log(`账号创建成功: ${dto.platform} - ${dto.nickname} (${account.id})`);
    return this.sanitizeAccount(account);
  }

  /**
   * 获取账号列表
   */
  async findAll(params: {
    userId?: string;
    teamId?: string;
    groupId?: string;
    platform?: Platform;
    skip?: number;
    take?: number;
  }) {
    const { userId, teamId, groupId, platform, skip = 0, take = 20 } = params;

    const where: Prisma.AccountWhereInput = {};
    /* shared mode: skip userId filtering */
    if (teamId) where.teamId = teamId;
    if (groupId) where.groupId = groupId;
    if (platform) where.platform = platform;

    const [accounts, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        skip,
        take,
        include: {
          owner: {
            select: { id: true, name: true, email: true },
          },
          team: {
            select: { id: true, name: true },
          },
          _count: {
            select: { posts: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.account.count({ where }),
    ]);

    return {
      accounts: accounts.map((a) => this.sanitizeAccount(a)),
      total,
      skip,
      take,
    };
  }

  /**
   * 修复: 获取账号详情 — 添加 userId 跨租户隔离校验
   */
  async findById(id: string, userId?: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
        },
        posts: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            title: true,
            status: true,
            publishAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: { posts: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('账号不存在');
    }

    // 跨租户隔离 — 非管理员只能查看自己的账号
    if (userId) {
      await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号');
    }

    return this.sanitizeAccount(account);
  }

  /**
   * 更新账号信息
   */
  async update(id: string, dto: UpdateAccountDto, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException('账号不存在');
    }

    // 权限检查：只有账号所有者或管理员可以修改
    await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号');

    const updateData: Prisma.AccountUpdateInput = { ...dto };

    // 如果更新Cookie，需要加密
    if (dto.cookies) {
      updateData.cookies = this.encryptCookie(dto.cookies);
    }

    const updated = await this.prisma.account.update({
      where: { id },
      data: updateData,
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
        },
      },
    });

    return this.sanitizeAccount(updated);
  }

  /**
   * 删除账号
   */
  async remove(id: string, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException('账号不存在');
    }

    await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号');

    await this.prisma.account.delete({ where: { id } });
    this.logger.log(`账号已删除: ${id}`);
    return { success: true };
  }

  /**
   * 将账号移动到指定分组
   */
  async moveToGroup(accountId: string, groupId: string | null, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException('账号不存在');
    }

    // 权限校验
    await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号');

    // 验证分组归属
    if (groupId) {
      const group = await this.prisma.accountGroup.findFirst({
        where: { id: groupId, userId },
      });
      if (!group) {
        throw new NotFoundException('分组不存在或无权操作');
      }
    }

    const updated = await this.prisma.account.update({
      where: { id: accountId },
      data: { groupId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
        group: { select: { id: true, name: true, color: true } },
      },
    });

    this.logger.log(`账号 ${account.nickname} 移动到分组 ${groupId ?? '未分组'}`);
    return this.sanitizeAccount(updated);
  }

  /**
   * 获取账号Cookie（解密）
   */
  async getCookies(id: string, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException('账号不存在');
    }

    await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号');

    if (!account.cookies) {
      return { cookies: null };
    }

    return { cookies: this.decryptCookie(account.cookies) };
  }

  /**
   * 脱敏处理：隐藏Cookie字段
   */
  private sanitizeAccount(account: any) {
    const { cookies, ...rest } = account;
    return {
      ...rest,
      hasCookies: !!cookies,
    };
  }
}
