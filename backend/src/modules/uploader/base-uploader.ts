import { Platform } from '@prisma/client';

/**
 * 发布任务的输入参数
 */
export interface PublishTask {
  /** 内容 ID（Post.id） */
  contentId: string;
  /** 目标平台 */
  platform: Platform;
  /** 平台账号 ID（Account.id） */
  accountId: string;
  /** 标题 */
  title: string;
  /** 正文/描述 */
  content: string;
  /** 媒体文件 URL 列表（视频/图片） */
  mediaUrls: string[];
  /** 标签 */
  tags: string[];
  /** 封面图 URL */
  coverUrl?: string;
}

/**
 * 发布结果
 */
export interface PublishResult {
  success: boolean;
  /** 发布后的平台链接 */
  platformUrl?: string;
  /** 错误信息 */
  errorMsg?: string;
  /** 平台返回的作品 ID */
  platformPostId?: string;
}

/**
 * Cookie 存储结构
 */
export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * 登录状态
 */
export enum LoginStatus {
  VALID = 'VALID',
  EXPIRED = 'EXPIRED',
  UNKNOWN = 'UNKNOWN',
}

/**
 * 所有平台 Uploader 必须实现的接口
 */
export abstract class BaseUploader {
  abstract readonly platform: Platform;
  abstract readonly name: string;

  /**
   * 检查当前 Cookie 是否有效（是否还处于登录态）
   */
  abstract checkLogin(cookies: StoredCookie[]): Promise<LoginStatus>;

  /**
   * 执行登录流程（需要人工扫码/输入验证码时抛出 NeedManualLoginError）
   */
  abstract login(accountId: string): Promise<StoredCookie[]>;

  /**
   * 执行发布流程
   * @param task 发布任务
   * @param cookies 当前有效的 Cookie
   * @returns 发布结果
   */
  abstract publish(task: PublishTask, cookies: StoredCookie[]): Promise<PublishResult>;

  /**
   * 获取平台创作者中心 URL
   */
  abstract getCreatorUrl(): string;
}
