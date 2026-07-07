import { ref, computed } from 'vue'
import { analyticsApi, type AccountDetailItem, type DailyMetrics } from '@/api/analytics'
import { accountsApi } from '@/api/accounts'
import { formatLargeNum } from '@/utils/format'
import { toBackend } from '@/utils/platform'
import type { AnalyticsOverview, PlatformStats, TrendData, Account } from '@/types'

export interface KpiCard {
  key: string
  label: string
  value: number
  formatted: string
  trend: number | null
  trendLabel: string
}

export function useMatrixDashboard() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const days = ref(7)
  const platform = ref<string>('')
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
    // 互动 = 点赞 + 评论 + 分享
    const totalInteractions =
      ov.engagement.totalLikes + ov.engagement.totalComments + ov.engagement.totalShares
    // 互动环比 = 互动增量的环比
    const interactionTrend = (() => {
      const wow = comp?.weekOverWeek
      if (!wow) return null
      const cur =
        (wow.current?.likes || 0) + (wow.current?.comments || 0) + (wow.current?.shares || 0)
      const prev =
        (wow.previous?.likes || 0) + (wow.previous?.comments || 0) + (wow.previous?.shares || 0)
      if (prev === 0) return null
      return Math.round(((cur - prev) / prev) * 100)
    })()

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
        value: totalInteractions,
        formatted: formatLargeNum(totalInteractions),
        trend: interactionTrend,
        trendLabel: '较上周',
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
    play: number | null
    issue?: number
    new_fans: number | null
    uv?: number
    like: number | null
    comment: number | null
    share: number | null
    fansFormatted: string
    playFormatted: string
    newFansFormatted: string
    likeFormatted: string
    commentFormatted: string
    shareFormatted: string
    /** 该行数据是否为 null（无采集数据） */
    isStale: boolean
    /** 最近采集日期 */
    dataDate: string | null
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

      // source 为 null 表示该周期无采集数据
      const isStale = !source
      const play = source?.play ?? null
      const new_fans = source?.new_fans ?? null
      const like = source?.like ?? null
      const comment = source?.comment ?? null
      const share = source?.share ?? null

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
        playFormatted: play === null ? '—' : formatLargeNum(play),
        newFansFormatted: new_fans === null ? '—' : formatLargeNum(new_fans),
        likeFormatted: like === null ? '—' : formatLargeNum(like),
        commentFormatted: comment === null ? '—' : formatLargeNum(comment),
        shareFormatted: share === null ? '—' : formatLargeNum(share),
        isStale,
        dataDate: (acc as any).dataDate ?? null,
      }
    })

    // 排序：null 值始终排在最后
    if (sortKey.value) {
      const dir = sortOrder.value === 'asc' ? 1 : -1
      rows.sort((a: any, b: any) => {
        const av = a[sortKey.value]
        const bv = b[sortKey.value]
        // null 排最后
        if (av === null && bv === null) return 0
        if (av === null) return 1
        if (bv === null) return -1
        return (av - bv) * dir
      })
    }

    return rows
  })

  function toggleSort(prop: string, order?: string | null) {
    const propMap: Record<string, string> = {
      fansFormatted: 'fans',
      playFormatted: 'play',
      newFansFormatted: 'new_fans',
      likeFormatted: 'like',
      commentFormatted: 'comment',
      shareFormatted: 'share',
    }
    const key = propMap[prop] || prop
    if (!key || !order) {
      sortKey.value = ''
      return
    }
    sortKey.value = key
    sortOrder.value = order === 'ascending' ? 'asc' : 'desc'
  }

  // ─── Platform Table (互动 = 点赞 + 评论 + 分享) ───
  const platformTableData = computed(() => {
    return platformStats.value.map((p) => {
      const interactions = (p.likes || 0) + (p.comments || 0) + (p.shares || 0)
      return {
        ...p,
        interactions,
        viewsFormatted: formatLargeNum(p.views || 0),
        likesFormatted: formatLargeNum(interactions),
        followersFormatted: formatLargeNum(p.followers || 0),
      }
    })
  })

  const platformChartData = computed(() => {
    const platforms = platformStats.value
    return {
      platforms: platforms.map((p) => p.platform),
      views: platforms.map((p) => p.views || 0),
      likes: platforms.map((p) => (p.likes || 0) + (p.comments || 0) + (p.shares || 0)),
      followers: platforms.map((p) => p.followers || 0),
    }
  })

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

  // ─── 环比趋势（基于 comparison 数据） ───
  const aggregatedTrends = computed<Record<string, number | null>>(() => {
    const comp = comparison.value
    if (!comp) return {}
    const period = dateType.value
    if (period === 'day') {
      // 日数据没有内置环比，返回空
      return {}
    }
    const src = period === 'week' ? comp.weekOverWeek : comp.monthOverMonth
    if (!src?.change) return {}
    const c = src.change
    return {
      play: c.views ?? null,
      new_fans: c.followers ?? null,
      like: c.likes ?? null,
      comment: c.comments ?? null,
      share: c.shares ?? null,
    } as Record<string, number | null>
  })

  // ─── 跨 Group 对比 ───
  interface GroupComparisonRow {
    groupId: string
    groupName: string
    accountCount: number
    followers: number
    play: number
    like: number
    comment: number
    share: number
    interactions: number
    avgFollowers: number
    avgInteractions: number
    followersFormatted: string
    playFormatted: string
    interactionsFormatted: string
    avgFollowersFormatted: string
    avgInteractionsFormatted: string
  }
  const allAccounts = ref<Account[]>([])
  const groupComparison = computed<GroupComparisonRow[]>(() => {
    const detailList = accountDetailList.value
    const accList = allAccounts.value
    if (detailList.length === 0 || accList.length === 0) return []

    // 构建 accountId -> groupName 映射
    const accountGroupMap = new Map<string, { groupId: string; groupName: string }>()
    for (const acc of accList) {
      accountGroupMap.set(acc.id, {
        groupId: acc.groupId || '',
        groupName: acc.groupName || '未分组',
      })
    }

    // 按 group 聚合
    const groupMap = new Map<
      string,
      {
        groupName: string
        accountCount: number
        followers: number
        play: number
        like: number
        comment: number
        share: number
      }
    >()
    for (const detail of detailList) {
      const groupInfo = accountGroupMap.get(detail.id) || { groupId: '', groupName: '未分组' }
      const key = groupInfo.groupId || '__none__'
      const period = dateType.value
      const source =
        period === 'day'
          ? detail.info.day_total
          : period === 'week'
            ? detail.info.week_total
            : detail.info.month_total

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          groupName: groupInfo.groupName,
          accountCount: 0,
          followers: 0,
          play: 0,
          like: 0,
          comment: 0,
          share: 0,
        })
      }
      const g = groupMap.get(key)!
      g.accountCount += 1
      g.followers += detail.fans || 0
      g.play += source?.play || 0
      g.like += source?.like || 0
      g.comment += source?.comment || 0
      g.share += source?.share || 0
    }

    return Array.from(groupMap.entries())
      .map(([groupId, g]) => {
        const interactions = g.like + g.comment + g.share
        const avgFollowers = Math.round(g.followers / Math.max(g.accountCount, 1))
        const avgInteractions = Math.round(interactions / Math.max(g.accountCount, 1))
        return {
          groupId,
          groupName: g.groupName,
          accountCount: g.accountCount,
          followers: g.followers,
          play: g.play,
          like: g.like,
          comment: g.comment,
          share: g.share,
          interactions,
          avgFollowers,
          avgInteractions,
          followersFormatted: formatLargeNum(g.followers),
          playFormatted: formatLargeNum(g.play),
          interactionsFormatted: formatLargeNum(interactions),
          avgFollowersFormatted: formatLargeNum(avgFollowers),
          avgInteractionsFormatted: formatLargeNum(avgInteractions),
        }
      })
      .sort((a, b) => b.followers - a.followers)
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
      const [ov, comp, ps, ft, vt, er, adl, grps, accs] = await Promise.all([
        analyticsApi.getOverview(gid ? { groupId: gid } : undefined).then((r: any) => r.data),
        analyticsApi.getComparison(gid ? { groupId: gid } : undefined).then((r: any) => r.data),
        analyticsApi.getPlatformStats(gid ? { groupId: gid } : undefined).then((r: any) => r.data),
        analyticsApi.getFollowerTrend(filter).then((r: any) => r.data),
        analyticsApi.getViewsTrend(filter).then((r: any) => r.data),
        analyticsApi.getEngagementRate(filter).then((r: any) => r.data),
        analyticsApi.getAccountDetailList(pFilter).then((r: any) => r.data),
        accountsApi.getGroups().then((r: any) => r.data),
        accountsApi
          .getList({ platform: '', group: '', keyword: '', page: 1, pageSize: 500 })
          .then((r: any) => r.data),
      ])
      overview.value = ov
      comparison.value = comp
      platformStats.value = ps || []
      followerTrend.value = ft || []
      dailyStatsTrend.value = vt || []
      engagementTrend.value = er || []
      accountDetailList.value = adl || []
      groups.value = grps || []
      allAccounts.value = accs?.items || accs?.accounts || accs?.list || []
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
    trendMetric,
    overview,
    kpiCards,
    aggregatedStats,
    aggregatedTrends,
    platformStats,
    platformTableData,
    platformChartData,
    followerTrend,
    engagementTrend,
    dailyStatsTrend,
    trendChartData,
    accountTableData,
    sortKey,
    sortOrder,
    toggleSort,
    groups,
    groupId,
    groupComparison,
    refreshAll,
  }
}
