import { get, post } from './request'
import service from './request'
import type { AnalyticsOverview, TrendData, PlatformStats, PublishEffect } from '@/types'
import { getCompanionUrl } from '@/composables/useCompanionUrl'

export interface DailyMetrics {
  play: number
  like: number
  comment: number
  share: number
  new_fans: number
}

export interface AccountDetailItem {
  id: string
  nickname: string
  avatar: string
  platform: string
  fans: number
  info: {
    day_total: DailyMetrics
    week_total: DailyMetrics
    month_total: DailyMetrics
  }
}

export const analyticsApi = {
  getOverview(params?: { groupId?: string; teamId?: string }) {
    return get<AnalyticsOverview>(
      '/analytics/overview',
      params ? (params as Record<string, unknown>) : undefined,
    )
  },

  getFollowerTrend(params: { days?: number; platform?: string }) {
    return get<TrendData[]>('/analytics/followers/trend', params as Record<string, unknown>)
  },

  getLikesTrend(params: { days?: number; platform?: string }) {
    return get<TrendData[]>('/analytics/likes/trend', params as Record<string, unknown>)
  },

  getPlatformStats(params?: { groupId?: string }) {
    return get<PlatformStats[]>(
      '/analytics/platforms',
      params ? (params as Record<string, unknown>) : undefined,
    )
  },

  getPublishEffect(params: { days?: number; contentId?: string; groupId?: string }) {
    return get<PublishEffect[]>('/analytics/publish-effect', params as Record<string, unknown>)
  },

  getEngagementRate(params: { days?: number; platform?: string }) {
    return get<TrendData[]>('/analytics/engagement', params as Record<string, unknown>)
  },

  // Blob 响应需绕过响应拦截器（拦截器会尝试解析 JSON 导致报错）
  exportReport(params: { startDate: string; endDate: string; format: 'csv' | 'xlsx' }) {
    return service.get('/analytics/export', {
      params,
      responseType: 'blob',
    })
  },

  getReport(params?: { startDate?: string; endDate?: string; platform?: string }) {
    return get<{
      period: { start: string; end: string }
      overview: any
      accounts: any[]
      topPosts: any[]
      dailyTrend: any[]
    }>('/analytics/report', params as Record<string, unknown>)
  },

  getComparison(params?: { groupId?: string }) {
    return get<{
      weekOverWeek: { current: any; previous: any; change: any }
      monthOverMonth: { current: any; previous: any; change: any }
      yearOverYear: { current: any; previous: any; change: any }
    }>('/analytics/comparison', params ? (params as Record<string, unknown>) : undefined)
  },

  getViewsRanking(params?: {
    limit?: number
    period?: 'week' | 'month' | 'all'
    platform?: string
  }) {
    return get<{
      ranking: Array<{
        rank: number
        postId: string
        title: string
        platform: string
        accountName: string
        accountAvatar: string
        views: number
        likes: number
        comments: number
        shares: number
        completionRate: number
        avgPlayDuration: number
        engagementRate: number
        publishedAt: string
      }>
      total: number
      period: string
    }>('/analytics/views-ranking', params as Record<string, unknown>)
  },

  getEngagementRanking(params?: {
    limit?: number
    period?: 'week' | 'month' | 'all'
    platform?: string
  }) {
    return get<{
      ranking: Array<{
        rank: number
        postId: string
        title: string
        platform: string
        accountName: string
        accountAvatar: string
        views: number
        likes: number
        comments: number
        shares: number
        engagementRate: number
        publishedAt: string
      }>
      total: number
      period: string
    }>('/analytics/engagement-ranking', params as Record<string, unknown>)
  },

  getTags(params?: { groupId?: string }) {
    return get<Array<{ name: string; count: number }>>(
      '/analytics/tags',
      params ? (params as Record<string, unknown>) : undefined,
    )
  },

  getAccountDetailList(params?: { platform?: string; groupId?: string }) {
    return get<AccountDetailItem[]>(
      '/analytics/account-detail-list',
      params as Record<string, unknown>,
    )
  },

  getMonetization(days?: number) {
    return get<{
      totalRevenue: number
      totalGmv: number
      totalOrders: number
      totalCommission: number
      totalBuyerCount: number
      totalAvgOrderValue: number
      byPlatform: Array<{
        platform: string
        revenue: number
        gmv: number
        orders: number
        commission: number
        buyerCount: number
        avgOrderValue: number
      }>
      dailyTrend: Array<{
        date: string
        revenue: number
        gmv: number
        orders: number
        commission: number
        buyerCount: number
        avgOrderValue: number
      }>
    }>('/analytics/monetization', { days })
  },

  createManualMonetization(data: {
    date: string
    platform: string
    revenue?: number
    gmv?: number
    orders?: number
    buyerCount?: number
    commission?: number
    avgOrderValue?: number
  }) {
    return post('/analytics/monetization/manual', data)
  },

  // 触发桌面伴侣采集真实数据（伴侣URL通过环境变量或健康检查自动探测）
  async triggerRealDataCollection() {
    const companionUrl = await getCompanionUrl()
    if (!companionUrl) {
      throw new Error('桌面伴侣未启动，请先打开桌面伴侣')
    }
    try {
      const resp = await fetch(`${companionUrl}/api/data-collection/trigger`, {
        method: 'POST',
      })
      const json = await resp.json()
      return json
    } catch {
      throw new Error('桌面伴侣未启动，请先打开桌面伴侣')
    }
  },
}
