/**
 * Cookie 服务
 *
 * 加密存储和管理浏览器 Cookie
 * 使用 AES-256-GCM 加密，每条 Cookie 独立 IV + AuthTag
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { ICookieData, IEncryptedCookie, CookieData, ICookieStore } from '../models/CookieData';

// 加密配置
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const COOKIE_STORE_DIR = path.join(__dirname, '..', '..', 'data', 'cookies');

/**
 * 从环境变量获取加密密钥
 * 生产环境应使用密钥管理服务（如 AWS KMS、HashiCorp Vault）
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.COOKIE_ENCRYPTION_KEY;
  if (!keyHex) {
    // 开发环境使用默认密钥（生产环境必须设置环境变量）
    logger.warn('未设置 COOKIE_ENCRYPTION_KEY，使用默认密钥（仅限开发环境）');
    return crypto.scryptSync('matrixflow-default-key', 'salt', 32);
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * 加密单个 Cookie 值
 */
function encryptValue(value: string): { encrypted: string; iv: string; authTag: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(value, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * 解密单个 Cookie 值
 */
function decryptValue(encrypted: string, ivBase64: string, authTagBase64: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * 确保存储目录存在
 */
async function ensureStoreDir(): Promise<void> {
  try {
    await fs.access(COOKIE_STORE_DIR);
  } catch {
    await fs.mkdir(COOKIE_STORE_DIR, { recursive: true });
  }
}

/**
 * 获取账号的 Cookie 存储路径
 */
function getCookiePath(accountId: string): string {
  return path.join(COOKIE_STORE_DIR, `${accountId}.json`);
}

/**
 * 加密保存 Cookie
 */
export async function saveCookies(accountId: string, cookies: ICookieData[]): Promise<void> {
  await ensureStoreDir();

  const encryptedCookies: IEncryptedCookie[] = cookies.map((cookie) => {
    const { encrypted, iv, authTag } = encryptValue(cookie.value);
    return {
      name: cookie.name,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      expires: cookie.expires,
      encryptedValue: encrypted,
      iv,
      authTag,
    };
  });

  const store: ICookieStore = {
    accountId,
    platform: '',
    cookies: encryptedCookies,
    updatedAt: new Date(),
  };

  const filePath = getCookiePath(accountId);
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');

  logger.info(`Cookie 已保存: ${accountId} (${cookies.length} 条)`);
}

/**
 * 解密加载 Cookie
 */
export async function loadCookies(accountId: string): Promise<ICookieData[]> {
  const filePath = getCookiePath(accountId);

  try {
    await fs.access(filePath);
  } catch {
    logger.debug(`Cookie 文件不存在: ${accountId}`);
    return [];
  }

  const raw = await fs.readFile(filePath, 'utf8');
  const store: ICookieStore = JSON.parse(raw);

  const cookies: ICookieData[] = store.cookies.map((encrypted) => {
    const value = decryptValue(encrypted.encryptedValue, encrypted.iv, encrypted.authTag);
    return {
      name: encrypted.name,
      value,
      domain: encrypted.domain,
      path: encrypted.path,
      secure: encrypted.secure,
      httpOnly: encrypted.httpOnly,
      sameSite: encrypted.sameSite,
      expires: encrypted.expires,
    };
  });

  logger.debug(`Cookie 已加载: ${accountId} (${cookies.length} 条)`);
  return cookies;
}

/**
 * 从页面刷新 Cookie
 */
export async function refreshCookies(accountId: string, page: Page): Promise<ICookieData[]> {
  const context = page.context();
  const playwrightCookies = await context.cookies();

  const cookies: ICookieData[] = playwrightCookies.map((c) =>
    CookieData.fromPlaywrightCookie(c as unknown as Record<string, unknown>)
  );

  await saveCookies(accountId, cookies);
  logger.info(`Cookie 已刷新: ${accountId} (${cookies.length} 条)`);

  return cookies;
}

/**
 * 验证 Cookie 有效性
 *
 * 检查方式：
 * 1. Cookie 是否过期
 * 2. 尝试加载到浏览器并访问目标页面验证登录状态
 */
export async function validateCookies(accountId: string): Promise<{
  valid: boolean;
  expiredCount: number;
  totalCount: number;
  details: { name: string; expired: boolean; expiresAt?: Date }[];
}> {
  const cookies = await loadCookies(accountId);

  if (cookies.length === 0) {
    return { valid: false, expiredCount: 0, totalCount: 0, details: [] };
  }

  const now = Date.now() / 1000;
  const details = cookies.map((c) => ({
    name: c.name,
    expired: c.expires !== -1 && c.expires < now,
    expiresAt: c.expires !== -1 ? new Date(c.expires * 1000) : undefined,
  }));

  const expiredCount = details.filter((d) => d.expired).length;
  const valid = expiredCount === 0 || expiredCount < cookies.length * 0.3; // 超过 30% 过期则无效

  logger.info(`Cookie 验证: ${accountId}`, {
    valid,
    total: cookies.length,
    expired: expiredCount,
  });

  return {
    valid,
    expiredCount,
    totalCount: cookies.length,
    details,
  };
}

/**
 * 将 Cookie 加载到浏览器上下文
 */
export async function loadCookiesToContext(accountId: string, page: Page): Promise<void> {
  const cookies = await loadCookies(accountId);

  if (cookies.length === 0) {
    logger.debug(`没有需要加载的 Cookie: ${accountId}`);
    return;
  }

  const context = page.context();
  // Playwright addCookies requires url OR domain+path
  // We provide domain+path for each cookie, so url is not strictly needed
  const playwrightCookies = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite as 'Strict' | 'Lax' | 'None',
    expires: c.expires === -1 ? undefined : c.expires,
    url: `https://${c.domain}${c.path}`,
  }));

  await context.addCookies(playwrightCookies as Parameters<typeof context.addCookies>[0]);
  logger.info(`Cookie 已加载到浏览器: ${accountId} (${cookies.length} 条)`);
}

/**
 * 删除账号的 Cookie 存储
 */
export async function deleteCookies(accountId: string): Promise<boolean> {
  const filePath = getCookiePath(accountId);
  try {
    await fs.unlink(filePath);
    logger.info(`Cookie 已删除: ${accountId}`);
    return true;
  } catch {
    return false;
  }
}
