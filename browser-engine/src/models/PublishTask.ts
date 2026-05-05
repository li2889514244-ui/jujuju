/**
 * 发布任务模型
 *
 * 管理跨平台内容发布任务的生命周期
 */

export enum TaskStatus {
  /** 等待中 */
  PENDING = 'pending',
  /** 排队中（等待资源） */
  QUEUED = 'queued',
  /** 执行中 */
  RUNNING = 'running',
  /** 已成功 */
  SUCCESS = 'success',
  /** 已失败 */
  FAILED = 'failed',
  /** 已取消 */
  CANCELLED = 'cancelled',
  /** 重试中 */
  RETRYING = 'retrying',
}

export enum Platform {
  DOUYIN = 'douyin',
  KUAISHOU = 'kuaishou',
  XIAOHONGSHU = 'xiaohongshu',
  SHIPINHAO = 'shipinhao',
  BILIBILI = 'bilibili',
  WEIBO = 'weibo',
}

export interface IPublishContent {
  /** 标题 */
  title: string;
  /** 正文/描述 */
  description: string;
  /** 视频文件路径（本地或 URL） */
  videoPath?: string;
  /** 图片文件路径列表 */
  imagePaths?: string[];
  /** 话题标签 */
  hashtags?: string[];
  /** @提及的用户 */
  mentions?: string[];
  /** 位置信息 */
  location?: string;
  /** 定时发布时间（ISO 8601） */
  scheduledTime?: string;
  /** 封面图路径 */
  coverPath?: string;
  /** 额外参数（平台特有字段） */
  extra?: Record<string, unknown>;
}

export interface IPublishTask {
  /** 任务唯一 ID */
  id: string;
  /** 账号 ID */
  accountId: string;
  /** 目标平台 */
  platform: Platform;
  /** 发布内容 */
  content: IPublishContent;
  /** 任务状态 */
  status: TaskStatus;
  /** 重试次数 */
  retryCount: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
  /** 开始执行时间 */
  startedAt?: Date;
  /** 完成时间 */
  completedAt?: Date;
  /** 定时发布时间 */
  scheduledAt?: Date;
  /** 结果截图路径 */
  screenshotPath?: string;
  /** 错误信息 */
  error?: string;
  /** 发布后的平台 ID（如作品 ID） */
  publishedId?: string;
  /** 发布后的 URL */
  publishedUrl?: string;
}

export class PublishTask implements IPublishTask {
  id: string;
  accountId: string;
  platform: Platform;
  content: IPublishContent;
  status: TaskStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  scheduledAt?: Date;
  screenshotPath?: string;
  error?: string;
  publishedId?: string;
  publishedUrl?: string;

  constructor(params: {
    accountId: string;
    platform: Platform;
    content: IPublishContent;
    maxRetries?: number;
    scheduledAt?: Date;
  }) {
    this.id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    this.accountId = params.accountId;
    this.platform = params.platform;
    this.content = params.content;
    this.status = TaskStatus.PENDING;
    this.retryCount = 0;
    this.maxRetries = params.maxRetries ?? 3;
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.scheduledAt = params.scheduledAt;
  }

  /** 标记为执行中 */
  markRunning(): void {
    this.status = TaskStatus.RUNNING;
    this.startedAt = new Date();
    this.updatedAt = new Date();
  }

  /** 标记为成功 */
  markSuccess(publishedId?: string, publishedUrl?: string): void {
    this.status = TaskStatus.SUCCESS;
    this.completedAt = new Date();
    this.updatedAt = new Date();
    this.publishedId = publishedId;
    this.publishedUrl = publishedUrl;
  }

  /** 标记为失败 */
  markFailed(error: string): void {
    this.status = TaskStatus.FAILED;
    this.error = error;
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  /** 标记为取消 */
  markCancelled(): void {
    this.status = TaskStatus.CANCELLED;
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  /** 尝试重试 */
  canRetry(): boolean {
    return this.retryCount < this.maxRetries;
  }

  /** 执行重试 */
  retry(): boolean {
    if (!this.canRetry()) return false;
    this.retryCount++;
    this.status = TaskStatus.RETRYING;
    this.error = undefined;
    this.updatedAt = new Date();
    return true;
  }

  /** 序列化 */
  toJSON(): IPublishTask {
    return {
      id: this.id,
      accountId: this.accountId,
      platform: this.platform,
      content: this.content,
      status: this.status,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      scheduledAt: this.scheduledAt,
      screenshotPath: this.screenshotPath,
      error: this.error,
      publishedId: this.publishedId,
      publishedUrl: this.publishedUrl,
    };
  }
}
