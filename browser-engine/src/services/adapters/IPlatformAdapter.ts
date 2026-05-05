/**
 * 平台适配器接口
 *
 * 定义各平台发布适配器的统一接口
 * 所有平台适配器必须实现此接口
 */

import { Page } from 'playwright';
import { IPublishContent } from '../../models/PublishTask';

/**
 * 平台 CSS 选择器配置
 * 当平台 UI 改版时，只需更新选择器即可
 */
export interface IPlatformSelectors {
  /** 登录状态检查选择器 */
  loginCheck: string;
  /** 登录页面 URL */
  loginUrl: string;
  /** 发布入口 URL */
  publishUrl: string;
  /** 标题输入框 */
  titleInput?: string;
  /** 正文输入框 */
  contentInput: string;
  /** 上传视频按钮 */
  videoUpload?: string;
  /** 上传图片按钮 */
  imageUpload?: string;
  /** 封面上传 */
  coverUpload?: string;
  /** 话题输入 */
  hashtagInput?: string;
  /** 发布按钮 */
  publishButton: string;
  /** 发布成功标识 */
  successIndicator: string;
  /** 位置选择器 */
  locationSelector?: string;
}

/**
 * 发布结果
 */
export interface IPublishResult {
  /** 是否成功 */
  success: boolean;
  /** 发布后的作品 ID */
  publishedId?: string;
  /** 发布后的作品 URL */
  publishedUrl?: string;
  /** 错误信息 */
  error?: string;
  /** 耗时（毫秒） */
  duration: number;
}

/**
 * 平台适配器接口
 */
export interface IPlatformAdapter {
  /** 平台标识 */
  readonly platform: string;

  /** 平台中文名称 */
  readonly platformName: string;

  /**
   * 获取平台 CSS 选择器
   * 方便 UI 改版时统一更新
   */
  getSelectors(): IPlatformSelectors;

  /**
   * 检查登录状态
   * @returns true 表示已登录
   */
  checkLoginStatus(page: Page): Promise<boolean>;

  /**
   * 登录流程
   * @param page 浏览器页面
   * @param credentials 登录凭据（可选，Cookie 登录时不需要）
   */
  login(page: Page, credentials?: { username: string; password: string }): Promise<boolean>;

  /**
   * 发布内容
   * @param page 浏览器页面
   * @param content 发布内容
   * @returns 发布结果
   */
  publish(page: Page, content: IPublishContent): Promise<IPublishResult>;

  /**
   * 导航到发布页面
   */
  navigateToPublish(page: Page): Promise<void>;
}
