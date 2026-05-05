/**
 * Cookie 数据模型
 *
 * 管理浏览器 Cookie 的存储和加密
 * 每条 Cookie 独立加密，使用 AES-256-GCM
 */

export interface ICookieData {
  /** Cookie 名称 */
  name: string;
  /** Cookie 值（明文，仅在内存中） */
  value: string;
  /** 所属域名 */
  domain: string;
  /** 路径 */
  path: string;
  /** 是否安全传输 */
  secure: boolean;
  /** 是否 HttpOnly */
  httpOnly: boolean;
  /** SameSite 属性 */
  sameSite: 'Strict' | 'Lax' | 'None';
  /** 过期时间（Unix 时间戳，秒） */
  expires: number;
}

export interface IEncryptedCookie {
  /** Cookie 元数据（不含 value） */
  name: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
  expires: number;
  /** 加密后的值（Base64） */
  encryptedValue: string;
  /** 初始化向量（Base64） */
  iv: string;
  /** 认证标签（Base64） */
  authTag: string;
}

export interface ICookieStore {
  /** 账号 ID */
  accountId: string;
  /** 平台标识 */
  platform: string;
  /** 加密的 Cookie 列表 */
  cookies: IEncryptedCookie[];
  /** 最后更新时间 */
  updatedAt: Date;
  /** Cookie 来源 URL */
  sourceUrl?: string;
}

export class CookieData implements ICookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
  expires: number;

  constructor(data: Partial<ICookieData> & Pick<ICookieData, 'name' | 'value' | 'domain'>) {
    this.name = data.name;
    this.value = data.value;
    this.domain = data.domain;
    this.path = data.path || '/';
    this.secure = data.secure ?? false;
    this.httpOnly = data.httpOnly ?? false;
    this.sameSite = data.sameSite || 'Lax';
    this.expires = data.expires || -1;
  }

  /** 检查 Cookie 是否已过期 */
  isExpired(): boolean {
    if (this.expires === -1) return false;
    return Date.now() / 1000 > this.expires;
  }

  /** 转换为 Playwright Cookie 格式 */
  toPlaywrightCookie(): Record<string, unknown> {
    return {
      name: this.name,
      value: this.value,
      domain: this.domain,
      path: this.path,
      secure: this.secure,
      httpOnly: this.httpOnly,
      sameSite: this.sameSite,
      expires: this.expires === -1 ? undefined : this.expires,
    };
  }

  /** 从 Playwright Cookie 创建 */
  static fromPlaywrightCookie(cookie: Record<string, unknown>): CookieData {
    return new CookieData({
      name: cookie.name as string,
      value: cookie.value as string,
      domain: cookie.domain as string,
      path: (cookie.path as string) || '/',
      secure: (cookie.secure as boolean) ?? false,
      httpOnly: (cookie.httpOnly as boolean) ?? false,
      sameSite: (cookie.sameSite as 'Strict' | 'Lax' | 'None') || 'Lax',
      expires: (cookie.expires as number) || -1,
    });
  }
}
