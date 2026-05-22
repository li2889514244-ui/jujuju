/**
 * 数据采集接口定义
 * 统一的平台数据采集接口
 */

export interface AccountMetrics {
  platform: string;
  platformUserId: string;
  nickname: string;
  followers: number;
  following: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  collectedAt: Date;
}

export interface ContentMetrics {
  contentId: string;
  title: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  createdAt: Date;
  collectedAt: Date;
}

export interface DailyMetrics {
  platform: string;
  platformUserId: string;
  date: Date;
  followers: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface CollectorResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  collectedAt: Date;
}

/**
 * 数据采集器接口
 */
export interface IDataCollector {
  /** 平台标识 */
  readonly platform: string;

  /**
   * 采集账号指标
   */
  collectAccountMetrics(accountId: string): Promise<CollectorResult<AccountMetrics>>;

  /**
   * 采集内容指标列表
   */
  collectContentMetrics(
    accountId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<CollectorResult<ContentMetrics[]>>;

  /**
   * 采集每日数据快照
   */
  collectDailyMetrics(accountId: string): Promise<CollectorResult<DailyMetrics>>;
}
