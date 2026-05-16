import { get, post } from './request'
import service from './request'
import type { AnalyticsOverview, TrendData, PlatformStats, PublishEffect } from '@/types'

export const analyticsApi = {
  getOverview(teamId?: string) {
    return get<AnalyticsOverview>('/analytics/overview', { teamId })
  },

  getFollowerTrend(params: { days?: number; platform?: string }) {
    return get<TrendData[]>('/analytics/followers/trend', params as Record<string, unknown>)
  },

  getLikesTrend(params: { days?: number; platform?: string }) {
    return get<TrendData[]>('/analytics/likes/trend', params as Record<string, unknown>)
  },

  getPlatformStats() {
    return get<PlatformStats[]>('/analytics/platforms')
  },

  getPublishEffect(params: { days?: number; contentId?: string }) {
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

  getComparison() {
    return get<{
      weekOverWeek: { current: any; previous: any; change: any }
      monthOverMonth: { current: any; previous: any; change: any }
      yearOverYear: { current: any; previous: any; change: any }
    }>('/analytics/comparison')
  },

  getViewsRanking(params?: { limit?: number; period?: 'week' | 'month' | 'all'; platform?: string }) {
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
        publishedAt: string
      }>
      total: number
      period: string
    }>('/analytics/views-ranking', params as Record<string, unknown>)
  },

  collectStats() {
    return post<{ message: string; accounts: number; dailyStatsGenerated: number; postStatsGenerated: number }>('/analytics/collect')
  },
}
