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
import { Platform, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);
  private readonly encryptionKey: string;
  private readonly algorithm = 'aes-256-cbc';

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
   * 加密Cookie
   */
  private encryptCookie(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * 解密Cookie
   */
  private decryptCookie(text: string): string {
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
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
      throw new ConflictException('该平台账号已存在');
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
        proxyConfig: dto.proxyConfig || undefined,
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
    platform?: Platform;
    skip?: number;
    take?: number;
  }) {
    const { userId, teamId, platform, skip = 0, take = 20 } = params;

    const where: Prisma.AccountWhereInput = {};
    if (userId) where.userId = userId;
    if (teamId) where.teamId = teamId;
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
   * 获取账号详情
   */
  async findById(id: string) {
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
    if (account.userId !== userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
        throw new ForbiddenException('无权修改此账号');
      }
    }

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

    if (account.userId !== userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
        throw new ForbiddenException('无权删除此账号');
      }
    }

    await this.prisma.account.delete({ where: { id } });
    this.logger.log(`账号已删除: ${id}`);
    return { success: true };
  }

  /**
   * 获取账号Cookie（解密）
   */
  async getCookies(id: string, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException('账号不存在');
    }

    if (account.userId !== userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
        throw new ForbiddenException('无权查看此账号Cookie');
      }
    }

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
