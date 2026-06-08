import { ref, computed } from 'vue'
import { analyticsApi, type AccountDetailItem, type DailyMetrics } from '@/api/analytics'
import { accountsApi } from '@/api/accounts'
import { formatLargeNum } from '@/utils/format'
import { toBackend } from '@/utils/platform'
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
  const dateType = ref<'day' | 'week' | 'month'>('day')
  const groupId = ref<string>('')

  // Groups for teacher-centric view
  const groups = ref<Array<{ id: string; name: string; _count: { accounts: number } }>>([])

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
  const accountDetailList = ref<AccountDetailItem[]>([])

  // ─── 日/周/月 聚合统计 (7 KPI 卡片) ───
  interface UserStat {
    id: number
    type: keyof DailyMetrics
    text: string
    value: number
  }

  const userStatDefs: Omit<UserStat, 'value'>[] = [
    { id: 1, type: 'play', text: '新增播放' },
    { id: 2, type: 'new_fans', text: '净增粉丝' },
    { id: 3, type: 'like', text: '新增点赞' },
    { id: 4, type: 'comment', text: '新增评论' },
    { id: 5, type: 'share', text: '新增分享' },
  ]

  const aggregatedStats = computed<UserStat[]>(() => {
    const list = accountDetailList.value
    return userStatDefs.map((def) => {
      let total = 0
      const period = dateType.value
      for (const acc of list) {
        const source =
          period === 'day'
            ? acc.info.day_total
            : period === 'week'
              ? acc.info.week_total
              : acc.info.month_total
        total += source?.[def.type] || 0
      }
      return { ...def, value: total }
    })
  })

  // ─── KPI Cards (保留原有的4张，新增日/周/月聚合卡) ───
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

  // ─── 日期类型标签 ───
  const dateTypeLabel = computed(() => {
    switch (dateType.value) {
      case 'day':
        return '昨日'
      case 'week':
        return '近7天'
      case 'month':
        return '近30天'
      default:
        return ''
    }
  })

  // ─── 账号明细表 ───
  interface AccountTableRow {
    id: string
    nickname: string
    avatar: string
    platform: string
    fans: number
    play: number
    issue?: number
    new_fans: number
    uv?: number
    like: number
    comment: number
    share: number
    fansFormatted: string
    playFormatted: string
    newFansFormatted: string
    likeFormatted: string
    commentFormatted: string
    shareFormatted: string
  }

  const sortKey = ref<string>('')
  const sortOrder = ref<'asc' | 'desc'>('desc')

  const accountTableData = computed<AccountTableRow[]>(() => {
    const list = accountDetailList.value
    const period = dateType.value

    const rows: AccountTableRow[] = list.map((acc) => {
      const source =
        period === 'day'
          ? acc.info.day_total
          : period === 'week'
            ? acc.info.week_total
            : acc.info.month_total

      const play = source?.play || 0
      const new_fans = source?.new_fans || 0
      const like = source?.like || 0
      const comment = source?.comment || 0
      const share = source?.share || 0

      return {
        id: acc.id,
        nickname: acc.nickname || '--',
        avatar: acc.avatar || '',
        platform: acc.platform,
        fans: acc.fans || 0,
        play,
        new_fans,
        like,
        comment,
        share,
        fansFormatted: formatLargeNum(acc.fans || 0),
        playFormatted: formatLargeNum(play),
        newFansFormatted: formatLargeNum(new_fans),
        likeFormatted: formatLargeNum(like),
        commentFormatted: formatLargeNum(comment),
        shareFormatted: formatLargeNum(share),
      }
    })

    // 排序
    if (sortKey.value) {
      const dir = sortOrder.value === 'asc' ? 1 : -1
      rows.sort((a: any, b: any) => (a[sortKey.value] - b[sortKey.value]) * dir)
    }

    return rows
  })

  function toggleSort(prop: string) {
    const propMap: Record<string, string> = {
      fansFormatted: 'fans',
      playFormatted: 'play',
      newFansFormatted: 'new_fans',
      likeFormatted: 'like',
      commentFormatted: 'comment',
      shareFormatted: 'share',
    }
    const key = propMap[prop] || prop
    if (!key) {
      sortKey.value = ''
      return
    }
    if (sortKey.value === key) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    } else {
      sortKey.value = key
      sortOrder.value = 'desc'
    }
  }

  // ─── Platform Table ───
  const platformTableData = computed(() => {
    return platformStats.value.map((p) => ({
      ...p,
      viewsFormatted: formatLargeNum(p.views || 0),
      likesFormatted: formatLargeNum(p.likes || 0),
      followersFormatted: formatLargeNum(p.followers || 0),
    }))
  })

  const platformChartData = computed(() => {
    const platforms = platformStats.value
    return {
      platforms: platforms.map((p) => p.platform),
      views: platforms.map((p) => p.views || 0),
      likes: platforms.map((p) => p.likes || 0),
      followers: platforms.map((p) => p.followers || 0),
    }
  })

  const currentRanking = computed(() =>
    rankingTab.value === 'views' ? viewsRanking.value : engagementRanking.value,
  )

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
      const gid = groupId.value || undefined
      const bp = platform.value ? toBackend(platform.value) : undefined
      const filter = { days: days.value, platform: bp, groupId: gid }
      const pFilter = { platform: bp, groupId: gid }
      const [ov, comp, ps, ft, vt, er, vr, tg, adl, grps] = await Promise.all([
        analyticsApi.getOverview(gid ? { groupId: gid } : undefined).then((r: any) => r.data),
        analyticsApi.getComparison(gid ? { groupId: gid } : undefined).then((r: any) => r.data),
        analyticsApi.getPlatformStats(gid ? { groupId: gid } : undefined).then((r: any) => r.data),
        analyticsApi.getFollowerTrend(filter).then((r: any) => r.data),
        analyticsApi.getViewsTrend(filter).then((r: any) => r.data),
        analyticsApi.getEngagementRate(filter).then((r: any) => r.data),
        analyticsApi
          .getViewsRanking({
            limit: 50,
            period: rankingPeriod.value,
            platform: bp,
            groupId: gid,
          })
          .then((r: any) => r.data),
        analyticsApi.getTags(gid ? { groupId: gid } : undefined).then((r: any) => r.data),
        analyticsApi.getAccountDetailList(pFilter).then((r: any) => r.data),
        accountsApi.getGroups().then((r: any) => r.data),
      ])
      overview.value = ov
      comparison.value = comp
      platformStats.value = ps || []
      followerTrend.value = ft || []
      dailyStatsTrend.value = vt || []
      engagementTrend.value = er || []
      accountDetailList.value = adl || []
      groups.value = grps || []

      viewsRanking.value = vr?.ranking || []
      tags.value = tg || []

      try {
        const enr = await analyticsApi
          .getEngagementRanking({
            limit: 50,
            period: rankingPeriod.value,
            platform: bp,
            groupId: gid,
          })
          .then((r: any) => r.data)
        engagementRanking.value = enr?.ranking || []
      } catch {
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
    dateType,
    dateTypeLabel,
    rankingPeriod,
    rankingTab,
    trendMetric,
    overview,
    kpiCards,
    aggregatedStats,
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
    accountTableData,
    sortKey,
    sortOrder,
    toggleSort,
    groups,
    groupId,
    refreshAll,
  }
}
