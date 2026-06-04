import { ref, computed } from 'vue'
import { analyticsApi } from '@/api/analytics'
import { formatLargeNum } from '@/utils/format'
import type { AnalyticsOverview, PlatformStats, TrendData } from '@/types'

export interface KpiCard {
  key: string
  label: string
  value: number
  formatted: string
  trend: number | null
  trendLabel: string
}

export interface RankingItem {
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
}

export interface TagItem {
  name: string
  count: number
}

export function useMatrixDashboard() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const days = ref(7)
  const platform = ref<string>('')
  const rankingPeriod = ref<'week' | 'month' | 'all'>('all')
  const rankingTab = ref<'views' | 'engagement'>('views')
  const trendMetric = ref<'followers' | 'views' | 'engagement'>('followers')

  // Data
  const overview = ref<AnalyticsOverview | null>(null)
  const comparison = ref<any>(null)
  const platformStats = ref<PlatformStats[]>([])
  const followerTrend = ref<TrendData[]>([])
  const engagementTrend = ref<TrendData[]>([])
  const dailyStatsTrend = ref<TrendData[]>([])
  const viewsRanking = ref<RankingItem[]>([])
  const engagementRanking = ref<RankingItem[]>([])
  const tags = ref<TagItem[]>([])

  // ─── KPI Cards ───
  const kpiCards = computed<KpiCard[]>(() => {
    const ov = overview.value
    const comp = comparison.value
    if (!ov) return []

    const getChange = (key: string) => comp?.weekOverWeek?.change?.[key] ?? null

    return [
      {
        key: 'followers',
        label: '总粉丝',
        value: ov.accounts.totalFollowers,
        formatted: formatLargeNum(ov.accounts.totalFollowers),
        trend: getChange('followers'),
        trendLabel: '较上周',
      },
      {
        key: 'views',
        label: '总播放量',
        value: ov.engagement.totalViews,
        formatted: formatLargeNum(ov.engagement.totalViews),
        trend: getChange('views'),
        trendLabel: '较上周',
      },
      {
        key: 'likes',
        label: '总互动',
        value: ov.engagement.totalLikes + ov.engagement.totalComments + ov.engagement.totalShares,
        formatted: formatLargeNum(
          ov.engagement.totalLikes + ov.engagement.totalComments + ov.engagement.totalShares,
        ),
        trend: null,
        trendLabel: '',
      },
      {
        key: 'accounts',
        label: '账号数',
        value: ov.accounts.total,
        formatted: String(ov.accounts.total),
        trend: null,
        trendLabel: '',
      },
    ]
  })

  // ─── Platform Table ───
  const platformTableData = computed(() => {
    return platformStats.value.map((p) => ({
      ...p,
      viewsFormatted: formatLargeNum(p.views || 0),
      likesFormatted: formatLargeNum(p.likes || 0),
      followersFormatted: formatLargeNum(p.followers || 0),
    }))
  })

  // ─── Platform Chart Data ───
  const platformChartData = computed(() => {
    const platforms = platformStats.value
    return {
      platforms: platforms.map((p) => p.platform),
      views: platforms.map((p) => p.views || 0),
      likes: platforms.map((p) => p.likes || 0),
      followers: platforms.map((p) => p.followers || 0),
    }
  })

  // ─── Ranking ───
  const currentRanking = computed(() =>
    rankingTab.value === 'views' ? viewsRanking.value : engagementRanking.value,
  )

  // ─── Trend Chart Data ───
  const trendChartData = computed(() => {
    switch (trendMetric.value) {
      case 'followers':
        return followerTrend.value
      case 'views':
        return dailyStatsTrend.value
      case 'engagement':
        return engagementTrend.value
      default:
        return followerTrend.value
    }
  })

  // ─── Fetch All ───
  async function refreshAll() {
    loading.value = true
    error.value = null
    try {
      const filter = { days: days.value, platform: platform.value || undefined }
      const [ov, comp, ps, ft, er, vr, tg] = await Promise.all([
        analyticsApi.getOverview().then((r: any) => r.data),
        analyticsApi.getComparison().then((r: any) => r.data),
        analyticsApi.getPlatformStats().then((r: any) => r.data),
        analyticsApi.getFollowerTrend(filter).then((r: any) => r.data),
        analyticsApi.getEngagementRate(filter).then((r: any) => r.data),
        analyticsApi
          .getViewsRanking({
            limit: 50,
            period: rankingPeriod.value,
            platform: platform.value || undefined,
          })
          .then((r: any) => r.data),
        analyticsApi.getTags().then((r: any) => r.data),
      ])
      overview.value = ov
      comparison.value = comp
      platformStats.value = ps || []
      followerTrend.value = ft || []
      engagementTrend.value = er || []

      // Daily views trend from publish effect aggregated by date
      const pe = await analyticsApi.getPublishEffect({ days: days.value }).then((r: any) => r.data)
      const byDate: Record<string, number> = {}
      if (pe) {
        for (const item of pe) {
          const d = item.date?.slice(0, 10) || item.publishedAt?.slice(0, 10)
          if (d) byDate[d] = (byDate[d] || 0) + (item.views || 0)
        }
      }
      dailyStatsTrend.value = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value }))

      viewsRanking.value = vr?.ranking || []
      tags.value = tg || []

      // Engagement ranking
      try {
        const enr = await analyticsApi
          .getEngagementRanking({
            limit: 50,
            period: rankingPeriod.value,
            platform: platform.value || undefined,
          })
          .then((r: any) => r.data)
        engagementRanking.value = enr?.ranking || []
      } catch {
        // fallback: sort views ranking by engagement
        engagementRanking.value = [...viewsRanking.value].sort(
          (a, b) => b.engagementRate - a.engagementRate,
        )
      }
    } catch (e: any) {
      error.value = e.message || '数据加载失败'
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    days,
    platform,
    rankingPeriod,
    rankingTab,
    trendMetric,
    overview,
    kpiCards,
    platformStats,
    platformTableData,
    platformChartData,
    followerTrend,
    engagementTrend,
    dailyStatsTrend,
    trendChartData,
    viewsRanking,
    engagementRanking,
    currentRanking,
    tags,
    refreshAll,
  }
}
