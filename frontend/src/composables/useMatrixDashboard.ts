import { ref, computed } from 'vue'
import { analyticsApi, type AccountDetailItem, type DailyMetrics, type PeriodDataStatus } from '@/api/analytics'
import { accountsApi } from '@/api/accounts'
import { formatLargeNum } from '@/utils/format'
import { toBackend } from '@/utils/platform'
import { useLoadingStore } from '@/store/loading'
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
  const allAccounts = ref<Account[]>([])

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

  const periodKeyMap = {
    day: 'day_total',
    week: 'week_total',
    month: 'month_total',
  } as const

  type PeriodKey = (typeof periodKeyMap)[keyof typeof periodKeyMap]

  function getPeriodSource(acc: AccountDetailItem, period = dateType.value) {
    const key = periodKeyMap[period]
    const source = acc.info[key]
    const status = acc.periodStatus?.[key] || buildFallbackPeriodStatus(key, source, acc.dataDate)
    return { key, source, status }
  }

  function canUseInCurrentSummary(status?: PeriodDataStatus) {
    return status?.state === 'complete' || status?.state === 'partial'
  }

  function buildFallbackPeriodStatus(
    key: PeriodKey,
    source: DailyMetrics | null,
    dataDate: string | null,
  ): PeriodDataStatus {
    const expectedDays = key === 'day_total' ? 1 : key === 'week_total' ? 7 : 30
    return {
      state: source ? 'historical' : 'empty',
      label: source && dataDate ? `历史数据 · 截至${dataDate.slice(5)}` : source ? '历史数据' : '暂无数据',
      dataDate,
      coveredDays: source ? 0 : 0,
      expectedDays,
    }
  }

  const aggregatedStats = computed<UserStat[]>(() => {
    const list = accountDetailList.value
    return userStatDefs.map((def) => {
      let total = 0
      for (const acc of list) {
        const { source, status } = getPeriodSource(acc)
        if (canUseInCurrentSummary(status)) total += source?.[def.type] || 0
      }
      return { ...def, value: total }
    })
  })

  const periodCompleteness = computed(() => {
    const total = accountDetailList.value.length
    let complete = 0
    let partial = 0
    let historical = 0
    let empty = 0
    for (const acc of accountDetailList.value) {
      const { status } = getPeriodSource(acc)
      if (status.state === 'complete') complete += 1
      else if (status.state === 'partial') partial += 1
      else if (status.state === 'historical') historical += 1
      else empty += 1
    }
    return { total, complete, partial, historical, empty }
  })

  const periodCompletenessLabel = computed(() => {
    const s = periodCompleteness.value
    if (s.total === 0) return ''
    if (s.partial === 0 && s.historical === 0 && s.empty === 0) {
      return `${s.total}个账号数据完整`
    }
    const parts = [`${s.total}个账号中`, `${s.complete}个完整`]
    if (s.partial) parts.push(`${s.partial}个不完整`)
    if (s.historical) parts.push(`${s.historical}个历史参考`)
    if (s.empty) parts.push(`${s.empty}个暂无数据`)
    return parts.join('，')
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
    online?: boolean
    onlineStatus?: string
    onlineLabel?: string
    onlineReason?: string
    tokenStatus?: string
    hasCookies?: boolean
    status?: string
    lastSuccessfulCollectAt?: string | null
    lastCollectAttemptAt?: string | null
    lastCollectStatus?: 'SUCCESS' | 'FAILED' | 'COLLECTING' | null
    lastCollectError?: string | null
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
    /** 当前周期数据状态：complete/partial/historical/empty */
    periodState: 'complete' | 'partial' | 'historical' | 'empty'
    /** 最近采集日期 */
    dataDate: string | null
    /** 无数据标签 */
    staleLabel: string
    dataStatusLabel: string
    dataStatusType: 'success' | 'warning' | 'danger' | 'info'
    dataStatusTitle: string
    /** 最新采集状态标签 */
    collectLabel: string
    /** 最新采集标签类型 */
    collectType: 'success' | 'warning' | 'danger' | 'info'
    /** 最新采集说明 */
    collectTitle: string
    /** 当前同步状态标签 */
    syncLabel: string
    /** 当前同步状态标签类型 */
    syncType: 'success' | 'warning' | 'danger' | 'info'
    /** 当前同步状态说明 */
    syncTitle: string
  }

  const sortKey = ref<string>('')
  const sortOrder = ref<'asc' | 'desc'>('desc')

  function buildCollectFreshness(dataDate: string | null): {
    label: string
    type: 'success' | 'warning' | 'danger' | 'info'
    title: string
  } {
    if (!dataDate) {
      return {
        label: '从未采集',
        type: 'danger',
        title: '该账号还没有成功采集记录',
      }
    }

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataDate)
    if (!match) {
      return {
        label: `${dataDate} 快照`,
        type: 'info',
        title: `最近采集日期：${dataDate}`,
      }
    }

    const [, year, month, day] = match
    const collectedAt = new Date(Number(year), Number(month) - 1, Number(day))
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysSince = Math.max(
      0,
      Math.floor((today.getTime() - collectedAt.getTime()) / (24 * 60 * 60 * 1000)),
    )
    const shortDate = `${month}-${day}`

    if (daysSince === 0) {
      return {
        label: '今日已采集',
        type: 'success',
        title: `最近采集日期：${dataDate}，今天已成功采集`,
      }
    }

    if (daysSince >= 7) {
      return {
        label: `${daysSince}天未采集`,
        type: 'danger',
        title: `最近采集日期：${dataDate}，距今 ${daysSince} 天`,
      }
    }

    return {
      label: `${shortDate} 快照`,
      type: daysSince >= 3 ? 'warning' : 'info',
      title: `最近采集日期：${dataDate}，距今 ${daysSince} 天`,
    }
  }

  function formatDateTime(value?: string | null) {
    if (!value) return ''
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return ''
    const pad = (num: number) => String(num).padStart(2, '0')
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  function buildSyncStatus(account?: {
    lastSuccessfulCollectAt?: string | null
    lastCollectAttemptAt?: string | null
    lastCollectStatus?: 'SUCCESS' | 'FAILED' | 'COLLECTING' | null
    lastCollectError?: string | null
  }): {
    label: string
    type: 'success' | 'warning' | 'danger' | 'info'
    title: string
  } {
    const status = account?.lastCollectStatus
    const successTime = formatDateTime(account?.lastSuccessfulCollectAt)
    const attemptTime = formatDateTime(account?.lastCollectAttemptAt)
    if (status === 'COLLECTING') {
      return {
        label: '正在同步',
        type: 'warning',
        title: attemptTime ? `开始同步：${attemptTime}` : '正在同步数据',
      }
    }
    if (status === 'FAILED') {
      return {
        label: '同步失败',
        type: 'danger',
        title: account?.lastCollectError || (attemptTime ? `上次尝试：${attemptTime}` : '上次同步失败'),
      }
    }
    if (account?.lastSuccessfulCollectAt) {
      return {
        label: successTime ? `更新 ${successTime}` : '已更新',
        type: 'success',
        title: successTime ? `最近成功同步：${successTime}` : '最近成功同步时间可用',
      }
    }
    return {
      label: '未同步',
      type: 'info',
      title: '还没有成功同步记录',
    }
  }

  const accountTableData = computed<AccountTableRow[]>(() => {
    const list = accountDetailList.value
    const period = dateType.value
    const accountMetaMap = new Map(allAccounts.value.map((account) => [account.id, account]))

    const rows: AccountTableRow[] = list.map((acc) => {
      const accountMeta = accountMetaMap.get(acc.id) as
        | (Account & {
            online?: boolean
            onlineStatus?: string
            onlineLabel?: string
            onlineReason?: string
            hasCookies?: boolean
            status?: string
            lastSuccessfulCollectAt?: string | null
            lastCollectAttemptAt?: string | null
            lastCollectStatus?: 'SUCCESS' | 'FAILED' | 'COLLECTING' | null
            lastCollectError?: string | null
          })
        | undefined
      const { source, status: periodStatus } = getPeriodSource(acc, period)

      // 只有"历史回退"行需要视觉弱化；partial 行数值正常显示（仅标签提示不完整）。
      const isStale = periodStatus.state === 'historical'
      const periodState = periodStatus.state as 'complete' | 'partial' | 'historical' | 'empty'

      // source 为 null 表示该周期无采集数据
      const play = source?.play ?? null
      const new_fans = source?.new_fans ?? null
      const like = source?.like ?? null
      const comment = source?.comment ?? null
      const share = source?.share ?? null
      const dataDate = (acc as any).dataDate ?? null
      const collectFreshness = buildCollectFreshness(dataDate)
      const syncStatus = buildSyncStatus(accountMeta)
      const dataStatusType =
        periodStatus.state === 'complete'
          ? 'success'
          : periodStatus.state === 'partial'
            ? 'warning'
            : periodStatus.state === 'historical'
              ? 'info'
              : 'danger'

      return {
        id: acc.id,
        nickname: acc.nickname || '--',
        avatar: acc.avatar || accountMeta?.avatar || '',
        platform: acc.platform,
        online: accountMeta?.online,
        onlineStatus: accountMeta?.onlineStatus,
        onlineLabel: accountMeta?.onlineLabel,
        onlineReason: accountMeta?.onlineReason,
        tokenStatus: accountMeta?.tokenStatus,
        hasCookies: accountMeta?.hasCookies,
        status: accountMeta?.status,
        lastSuccessfulCollectAt: accountMeta?.lastSuccessfulCollectAt,
        lastCollectAttemptAt: accountMeta?.lastCollectAttemptAt,
        lastCollectStatus: accountMeta?.lastCollectStatus,
        lastCollectError: accountMeta?.lastCollectError,
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
        periodState,
        dataDate,
        staleLabel: periodStatus.label,
        dataStatusLabel: periodStatus.label,
        dataStatusType,
        dataStatusTitle:
          periodStatus.state === 'empty'
            ? '当前周期没有可用采集数据'
            : `覆盖 ${periodStatus.coveredDays}/${periodStatus.expectedDays} 天，数据截止 ${periodStatus.dataDate || dataDate || '--'}`,
        collectLabel: collectFreshness.label,
        collectType: collectFreshness.type,
        collectTitle: collectFreshness.title,
        syncLabel: syncStatus.label,
        syncType: syncStatus.type,
        syncTitle: syncStatus.title,
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

  const healthAlerts = computed(() => {
    const alerts: Array<{
      key: string
      type: 'warning' | 'error' | 'info'
      title: string
      description: string
    }> = []
    const accountRows = allAccounts.value as Array<Account & { hasCookies?: boolean; status?: string }>
    const credentialRows = accountRows.filter(
      (account) =>
        account.hasCookies === false ||
        account.status === 'EXPIRED' ||
        account.status === 'DISABLED' ||
        account.cookieStatus === 'expired' ||
        account.tokenStatus === 'expired',
    )

    if (credentialRows.length > 0) {
      alerts.push({
        key: 'credentials',
        type: 'error',
        title: `${credentialRows.length} 个账号可能需要重新登录`,
        description: `凭据缺失或登录态可能过期。请到账号管理里重新扫码或更新登录状态。`,
      })
    }

    const failedPosts = overview.value?.posts.failed || 0
    if (failedPosts > 0) {
      alerts.push({
        key: 'failed-posts',
        type: 'warning',
        title: `${failedPosts} 条内容发布失败`,
        description: '请进入内容管理查看失败原因，优先处理账号登录态、平台限流或素材上传失败。',
      })
    }

    return alerts
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
      const { source, status } = getPeriodSource(detail)
      const usableSource = canUseInCurrentSummary(status) ? source : null

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
      g.play += usableSource?.play || 0
      g.like += usableSource?.like || 0
      g.comment += usableSource?.comment || 0
      g.share += usableSource?.share || 0
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
    const loadingStore = useLoadingStore()
    loadingStore.start()
    try {
      const gid = groupId.value || undefined
      const bp = platform.value ? toBackend(platform.value) : undefined
      const filter = { days: days.value, platform: bp, groupId: gid }
      const pFilter = { platform: bp, groupId: gid }
      const results = await Promise.allSettled([
        analyticsApi.getOverview(pFilter).then((r: any) => r.data),
        analyticsApi.getComparison(pFilter).then((r: any) => r.data),
        analyticsApi.getPlatformStats(pFilter).then((r: any) => r.data),
        analyticsApi.getFollowerTrend(filter).then((r: any) => r.data),
        analyticsApi.getViewsTrend(filter).then((r: any) => r.data),
        analyticsApi.getEngagementRate(filter).then((r: any) => r.data),
        analyticsApi.getAccountDetailList(pFilter).then((r: any) => r.data),
        accountsApi.getGroups().then((r: any) => r.data),
        accountsApi
          .getList({ platform: '', group: '', keyword: '', page: 1, pageSize: 500 })
          .then((r: any) => r.data),
      ])

      const valueAt = <T>(index: number, fallback: T): T => {
        const result = results[index]
        return result.status === 'fulfilled' ? (result.value ?? fallback) : fallback
      }

      overview.value = valueAt<AnalyticsOverview | null>(0, null)
      comparison.value = valueAt<any>(1, null)
      platformStats.value = valueAt<PlatformStats[]>(2, [])
      followerTrend.value = valueAt<TrendData[]>(3, [])
      dailyStatsTrend.value = valueAt<TrendData[]>(4, [])
      engagementTrend.value = valueAt<TrendData[]>(5, [])
      accountDetailList.value = valueAt<AccountDetailItem[]>(6, [])
      groups.value = valueAt<Array<{ id: string; name: string; _count: { accounts: number } }>>(
        7,
        [],
      )
      const accountsPayload = valueAt<any>(8, null)
      allAccounts.value = accountsPayload?.items || accountsPayload?.accounts || accountsPayload?.list || []

      const failedCount = results.filter((result) => result.status === 'rejected').length
      if (failedCount > 0) {
        error.value = `部分数据加载失败（${failedCount} 项），已清空失败模块避免展示旧数据`
      }
    } catch (e: any) {
      overview.value = null
      comparison.value = null
      platformStats.value = []
      followerTrend.value = []
      dailyStatsTrend.value = []
      engagementTrend.value = []
      accountDetailList.value = []
      groups.value = []
      allAccounts.value = []
      error.value = e.message || '数据加载失败'
    } finally {
      loading.value = false
      loadingStore.stop()
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
    periodCompleteness,
    periodCompletenessLabel,
    aggregatedTrends,
    platformStats,
    platformTableData,
    platformChartData,
    followerTrend,
    engagementTrend,
    dailyStatsTrend,
    trendChartData,
    accountTableData,
    healthAlerts,
    sortKey,
    sortOrder,
    toggleSort,
    groups,
    groupId,
    groupComparison,
    refreshAll,
  }
}
