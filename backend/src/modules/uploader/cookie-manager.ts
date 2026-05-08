import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StoredCookie } from './base-uploader';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';

/**
 * Cookie 管理器
 * 负责各平台登录态的加密存储、读取、过期检测
 */
@Injectable()
export class CookieManager {
  private readonly logger = new Logger(CookieManager.name);
  private readonly algorithm = 'aes-256-gcm';
  private encryptionKey: Buffer;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    // 从环境变量读取加密密钥，没有则生成一个（生产环境必须配置）
    const key = this.config.get<string>('COOKIE_ENCRYPTION_KEY') || '';
    if (key.length >= 32) {
      this.encryptionKey = Buffer.from(key.slice(0, 32));
    } else {
      this.logger.warn('COOKIE_ENCRYPTION_KEY 未配置或长度不足，使用默认密钥（仅限开发环境）');
      this.encryptionKey = Buffer.from('matrixflow-dev-key-32bytes!!!!!');
    }
  }

  /**
   * 加密 Cookie 数据
   */
  private encrypt(data: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * 解密 Cookie 数据
   */
  private decrypt(encryptedData: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(this.algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * 保存 Cookie 到数据库（加密存储在 Account.cookies 字段）
   */
  async saveCookies(accountId: string, cookies: StoredCookie[]): Promise<void> {
    const encrypted = this.encrypt(JSON.stringify(cookies));
    await this.prisma.account.update({
      where: { id: accountId },
      data: { cookies: encrypted },
    });
    this.logger.log(`Cookie 已保存: accountId=${accountId}, count=${cookies.length}`);
  }

  /**
   * 从数据库读取并解密 Cookie
   */
  async loadCookies(accountId: string): Promise<StoredCookie[] | null> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { cookies: true },
    });

    if (!account?.cookies) return null;

    try {
      const decrypted = this.decrypt(account.cookies);
      return JSON.parse(decrypted) as StoredCookie[];
    } catch (e) {
      this.logger.error(`Cookie 解密失败: accountId=${accountId}`, e);
      return null;
    }
  }

  /**
   * 清除 Cookie
   */
  async clearCookies(accountId: string): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: { cookies: null },
    });
    this.logger.log(`Cookie 已清除: accountId=${accountId}`);
  }
}
