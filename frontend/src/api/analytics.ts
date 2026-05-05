import { get } from './request'
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

  exportReport(params: { startDate: string; endDate: string; format: 'csv' | 'xlsx' }) {
    return get<Blob>('/analytics/export', params as Record<string, unknown>, {
      responseType: 'blob',
    })
  },
}
