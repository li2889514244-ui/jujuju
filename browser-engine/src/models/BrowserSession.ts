/**
 * 浏览器会话模型
 *
 * 管理浏览器上下文和页面的生命周期状态
 */

export enum SessionStatus {
  /** 初始化中 */
  INITIALIZING = 'initializing',
  /** 运行中 */
  ACTIVE = 'active',
  /** 空闲等待中 */
  IDLE = 'idle',
  /** 正在关闭 */
  CLOSING = 'closing',
  /** 已关闭 */
  CLOSED = 'closed',
  /** 异常 */
  ERROR = 'error',
}

export interface IBrowserSession {
  /** 会话唯一 ID */
  id: string;
  /** 关联的账号 ID */
  accountId: string;
  /** 浏览器类型 */
  browserType: 'chromium' | 'firefox' | 'webkit';
  /** 会话状态 */
  status: SessionStatus;
  /** 创建时间 */
  createdAt: Date;
  /** 最后活跃时间 */
  lastActiveAt: Date;
  /** 页面数量 */
  pageCount: number;
  /** 指纹信息 */
  fingerprint?: IFingerprintInfo;
  /** 代理配置 */
  proxy?: IProxyConfig;
  /** 错误信息 */
  error?: string;
}

export interface IFingerprintInfo {
  userAgent: string;
  viewport: { width: number; height: number };
  platform: string;
  language: string;
  webglVendor: string;
  webglRenderer: string;
}

export interface IProxyConfig {
  server: string;
  username?: string;
  password?: string;
  bypass?: string;
}

export class BrowserSession implements IBrowserSession {
  id: string;
  accountId: string;
  browserType: 'chromium' | 'firefox' | 'webkit';
  status: SessionStatus;
  createdAt: Date;
  lastActiveAt: Date;
  pageCount: number;
  fingerprint?: IFingerprintInfo;
  proxy?: IProxyConfig;
  error?: string;

  constructor(accountId: string, browserType: 'chromium' | 'firefox' | 'webkit' = 'chromium') {
    this.id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.accountId = accountId;
    this.browserType = browserType;
    this.status = SessionStatus.INITIALIZING;
    this.createdAt = new Date();
    this.lastActiveAt = new Date();
    this.pageCount = 0;
  }

  /** 更新活跃时间 */
  touch(): void {
    this.lastActiveAt = new Date();
  }

  /** 更新状态 */
  updateStatus(status: SessionStatus): void {
    this.status = status;
    this.touch();
  }

  /** 序列化为 JSON */
  toJSON(): IBrowserSession {
    return {
      id: this.id,
      accountId: this.accountId,
      browserType: this.browserType,
      status: this.status,
      createdAt: this.createdAt,
      lastActiveAt: this.lastActiveAt,
      pageCount: this.pageCount,
      fingerprint: this.fingerprint,
      proxy: this.proxy,
      error: this.error,
    };
  }
}
