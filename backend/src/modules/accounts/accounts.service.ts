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
   * #4 淇: 鍔犲瘑Cookie 鈥?浣跨敤 aes-256-gcm锛屾瘡鏉¤褰曠嫭绔嬮殢鏈?IV
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
   * #4 淇: 瑙ｅ瘑Cookie 鈥?鍏煎鏃?CBC 鏍煎紡
   */
  private decryptCookie(text: string): string {
    const parts = text.split(':');
    if (parts.length === 2) {
      // 鍏煎鏃х殑 CBC 鏍煎紡
      this.logger.warn('');
      const [ivHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    // 鏂扮殑 GCM 鏍煎紡: iv:authTag:encrypted
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
   * 鍒涘缓骞冲彴璐﹀彿
   */
  async create(dto: CreateAccountDto, userId: string) {
    // 妫€鏌ユ槸鍚﹀凡瀛樺湪
    const existing = await this.prisma.account.findUnique({
      where: {
        platform_platformUserId: {
          platform: dto.platform,
          platformUserId: dto.platformUserId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('');
    }

    // 鍔犲瘑Cookie
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

    this.logger.log(`璐﹀彿鍒涘缓鎴愬姛: ${dto.platform} - ${dto.nickname} (${account.id})`);
    return this.sanitizeAccount(account);
  }

  /**
   * 鑾峰彇璐﹀彿鍒楄〃
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
    if (userId) where.userId = userId;
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
   * #8 淇: 鑾峰彇璐﹀彿璇︽儏 鈥?娣诲姞 userId 璺ㄧ鎴烽殧绂绘牎楠?
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
      throw new NotFoundException('[garbled]');
    }

    // #8: 璺ㄧ鎴烽殧绂?鈥?闈炵鐞嗗憳鍙兘鏌ョ湅鑷繁鐨勮处鍙?
    if (userId && account.userId !== userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
        throw new ForbiddenException('[garbled]');
      }
    }

    return this.sanitizeAccount(account);
  }

  /**
   * 鏇存柊璐﹀彿淇℃伅
   */
  async update(id: string, dto: UpdateAccountDto, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException('[garbled]');
    }

    // 鏉冮檺妫€鏌ワ細鍙湁璐﹀彿鎵€鏈夎€呮垨绠＄悊鍛樺彲浠ヤ慨鏀?
    if (account.userId !== userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
        throw new ForbiddenException('[garbled]');
      }
    }

    const updateData: Prisma.AccountUpdateInput = { ...dto };

    // 濡傛灉鏇存柊Cookie锛岄渶瑕佸姞瀵?
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
   * 鍒犻櫎璐﹀彿
   */
  async remove(id: string, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException('[garbled]');
    }

    if (account.userId !== userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
        throw new ForbiddenException('[garbled]');
      }
    }

    await this.prisma.account.delete({ where: { id } });
    this.logger.log(`璐﹀彿宸插垹闄? ${id}`);
    return { success: true };
  }

  /**
   * 鑾峰彇璐﹀彿Cookie锛堣В瀵嗭級
   */
  async getCookies(id: string, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException('[garbled]');
    }

    if (account.userId !== userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
        throw new ForbiddenException('');
      }
    }

    if (!account.cookies) {
      return { cookies: null };
    }

    return { cookies: this.decryptCookie(account.cookies) };
  }

  /**
   * 鑴辨晱澶勭悊锛氶殣钘廋ookie瀛楁
   */
  private sanitizeAccount(account: any) {
    const { cookies, ...rest } = account;
    return {
      ...rest,
      hasCookies: !!cookies,
    };
  }
}
