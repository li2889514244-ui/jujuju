import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { analyticsApi } from '@/api/analytics'
import { accountsApi } from '@/api/accounts'
import { getPlatformColor, getPlatformLabel } from '@/composables/usePlatform'
import type {
  DashboardAccount,
  AccountGroupSummary,
  SummaryCardData,
  DailyStatsMap,
  Account,
  AccountGroup,
  PaginatedResponse,
} from '@/types'

/** Extract raw accounts array from PaginatedResponse (with backward-compat for legacy field names). */
function extractAccounts(data: PaginatedResponse<Account>): Account[] {
  const raw = data as PaginatedResponse<Account> & { accounts?: Account[]; list?: Account[] }
  return raw.items || raw.accounts || raw.list || []
}

export function useDashboard() {
  const period = ref('week')
  const loading = ref(false)
  const lastUpdate = ref('')
  const trendDays = ref(7)
  const selectedGroup = ref('all')

  const accountRows = ref<DashboardAccount[]>([])
  const accountGroups = ref<AccountGroupSummary[]>([])
  const platformDistribution = ref<{ value: number; name: string; itemStyle: { color: string } }[]>(
    [],
  )
  const followerTrendData = ref<number[]>([])

  const comparisonData = ref<{
    weekOverWeek: { current: number; previous: number; change: number }
    monthOverMonth: { current: number; previous: number; change: number }
    yearOverYear: { current: number; previous: number; change: number }
  } | null>(null)

  const displayAccounts = computed(() => accountRows.value.slice(0, 8))

  const filteredRows = computed(() => {
    if (selectedGroup.value === 'all') return accountRows.value
    return accountRows.value.filter((r) => r.groupName === selectedGroup.value)
  })

  const groupSummaryCards = computed<SummaryCardData[]>(() => {
    const rows = filteredRows.value
    const totalFollowers = rows.reduce((s, r) => s + r.followers, 0)
    const totalViews = rows.reduce((s, r) => s + r.views, 0)
    const totalLikes = rows.reduce((s, r) => s + r.likes, 0)
    const totalInteract = rows.reduce((s, r) => s + r.comments + r.shares, 0)
    return [
      { label: '总粉丝', rawValue: totalFollowers, trend: null, color: '#00cc99' },
      { label: '总播放量', rawValue: totalViews, trend: null, color: '#22c55e' },
      { label: '总点赞', rawValue: totalLikes, trend: null, color: '#f59e0b' },
      { label: '总互动', rawValue: totalInteract, trend: null, color: '#ef4444' },
    ]
  })

  /** Pure helper: extract a numeric views value from a comparison object shape. */
  function extractViews(val: unknown): number | null {
    if (val == null) return null
    if (typeof val === 'number') return val
    if (
      typeof val === 'object' &&
      val !== null &&
      'views' in val &&
      typeof (val as Record<string, unknown>).views === 'number'
    ) {
      return (val as Record<string, number>).views
    }
    return null
  }

  const timeComparisonCards = computed<SummaryCardData[]>(() => {
    const cd = comparisonData.value

    const weekViews = cd ? extractViews(cd.weekOverWeek?.current) : null
    const monthViews = cd ? extractViews(cd.monthOverMonth?.current) : null
    const weekChange = cd
      ? typeof cd.weekOverWeek?.change === 'number'
        ? cd.weekOverWeek.change
        : null
      : null
    const monthChange = cd
      ? typeof cd.monthOverMonth?.change === 'number'
        ? cd.monthOverMonth.change
        : null
      : null

    return [
      { label: '本周播放', rawValue: weekViews ?? 0, trend: weekChange, color: '#e0a030' },
      { label: '本月播放', rawValue: monthViews ?? 0, trend: monthChange, color: '#6b9e6c' },
    ]
  })

  async function refreshAll() {
    loading.value = true
    try {
      const [overviewRes, compRes] = await Promise.all([
        analyticsApi.getOverview(),
        analyticsApi.getComparison().catch((e) => {
          console.warn('Comparison unavailable:', e)
          return null
        }),
      ])
      const ov = overviewRes.data
      const comp = compRes?.data
      comparisonData.value = comp || null

      const [accRes, groupsRes] = await Promise.all([
        accountsApi.getList({ pageSize: 100, page: 1, platform: '', group: '', keyword: '' }),
        accountsApi.getGroups().catch(() => ({ data: [] as AccountGroup[] })),
      ])
      const accData = accRes.data
      const accs: Account[] = extractAccounts(accData)

      const groups: Record<string, string> = {}
      for (const g of groupsRes.data) {
        if (g.id) groups[g.id] = g.name
      }

      const dailyMap: DailyStatsMap = {}
      try {
        const reportRes = await analyticsApi.getReport()
        const rptAccs =
          (
            reportRes.data as {
              accounts?: Array<{
                id: string
                dailyStats?: Array<{
                  views?: number
                  likes?: number
                  comments?: number
                  shares?: number
                }>
              }>
            }
          )?.accounts || []
        for (const a of rptAccs) {
          const allStats = a.dailyStats || []
          dailyMap[a.id] = {
            views: allStats.reduce((sum, s) => sum + (s.views || 0), 0),
            likes: allStats.reduce((sum, s) => sum + (s.likes || 0), 0),
            comments: allStats.reduce((sum, s) => sum + (s.comments || 0), 0),
            shares: allStats.reduce((sum, s) => sum + (s.shares || 0), 0),
          }
        }
      } catch {
        /* daily stats unavailable */
      }

      accountRows.value = accs.map((a): DashboardAccount => {
        const daily = dailyMap[a.id] || { views: 0, likes: 0, comments: 0, shares: 0 }
        return {
          id: a.id,
          nickname: a.nickname || '未命名',
          avatar: a.avatar || '',
          platform: a.platform,
          groupName:
            (a as Account & { group?: { name?: string } }).group?.name ||
            groups[(a as Account & { groupId?: string }).groupId || ''] ||
            a.groupName ||
            '',
          followers: a.followers || 0,
          views: daily.views,
          likes: daily.likes,
          comments: daily.comments,
          shares: daily.shares,
          postCount: (a as Account & { _count?: { posts?: number } })._count?.posts || 0,
          hasCookies: (a as Account & { hasCookies?: boolean }).hasCookies || false,
          tokenStatus:
            (a as Account & { tokenStatus?: string; hasCookies?: boolean }).tokenStatus ||
            ((a as Account & { hasCookies?: boolean }).hasCookies ? 'valid' : 'unknown'),
        }
      })

      const groupMap: Record<string, DashboardAccount[]> = {}
      for (const row of accountRows.value) {
        const gName = row.groupName || '未分组'
        if (!groupMap[gName]) groupMap[gName] = []
        groupMap[gName].push(row)
      }
      accountGroups.value = Object.entries(groupMap).map(([name, accounts]) => ({
        name,
        accounts,
        totalFollowers: accounts.reduce((s, a) => s + a.followers, 0),
        totalViews: accounts.reduce((s, a) => s + a.views, 0),
        totalLikes: accounts.reduce((s, a) => s + a.likes, 0),
      }))

      const byPlatform: Record<string, number> = ov.accounts?.byPlatform || {}
      platformDistribution.value = Object.entries(byPlatform)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => ({
          value: count,
          name: getPlatformLabel(key),
          itemStyle: { color: getPlatformColor(key) },
        }))

      lastUpdate.value = dayjs().format('HH:mm:ss')
    } catch {
      ElMessage.error('数据加载失败，请检查网络连接后重试')
    } finally {
      loading.value = false
    }
  }

  async function loadFollowerTrend() {
    try {
      const res = await analyticsApi.getFollowerTrend({ days: trendDays.value })
      followerTrendData.value = (res.data || []).map((d: { value?: number }) => d.value || 0)
    } catch {
      followerTrendData.value = []
    }
  }

  function onPeriodChange() {
    refreshAll()
  }
  function onGroupChange() {}

  const followerChartOption = computed(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(26, 31, 42, 0.95)',
      borderColor: 'rgba(0, 204, 153, 0.15)',
      textStyle: { color: '#e8edf5', fontSize: 12 },
    },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: Array.from({ length: trendDays.value }, (_, i) =>
        dayjs()
          .subtract(trendDays.value - 1 - i, 'day')
          .format('MM-DD'),
      ),
      axisLine: { lineStyle: { color: 'rgba(0, 204, 153, 0.1)' } },
      axisTick: { show: false },
      axisLabel: { color: '#6b7390', fontSize: 11 },
    },
    yAxis: {
      type: 'value' as const,
      splitLine: { lineStyle: { color: 'rgba(0, 204, 153, 0.04)' } },
      axisLabel: { color: '#6b7390', fontSize: 11 },
    },
    series:
      followerTrendData.value.length > 0
        ? [
            {
              name: '粉丝',
              type: 'line' as const,
              smooth: true,
              symbol: 'circle',
              symbolSize: 4,
              lineStyle: { width: 2 },
              itemStyle: { color: '#00cc99' },
              areaStyle: {
                color: {
                  type: 'linear' as const,
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: 'rgba(0, 204, 153, 0.2)' },
                    { offset: 1, color: 'rgba(0, 204, 153, 0)' },
                  ],
                },
              },
              data: followerTrendData.value,
            },
          ]
        : [],
  }))

  const platformChartOption = computed(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: 'rgba(26, 31, 42, 0.95)',
      borderColor: 'rgba(0, 204, 153, 0.15)',
      textStyle: { color: '#e8edf5', fontSize: 12 },
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#a09888', fontSize: 11 },
    },
    series: [
      {
        type: 'pie' as const,
        radius: ['45%', '75%'],
        center: ['50%', '45%'],
        itemStyle: {
          borderRadius: 4,
          borderColor: '#1a1817',
          borderWidth: 3,
        },
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: 'bold' as const, color: '#f0ece4' },
        },
        data:
          platformDistribution.value.length > 0
            ? platformDistribution.value
            : [{ value: 0, name: '暂无数据', itemStyle: { color: '#4a4540' } }],
      },
    ],
  }))

  onMounted(() => {
    refreshAll()
    loadFollowerTrend()
  })

  return {
    period,
    loading,
    trendDays,
    selectedGroup,
    lastUpdate,
    accountRows,
    accountGroups,
    platformDistribution,
    followerTrendData,
    displayAccounts,
    filteredRows,
    groupSummaryCards,
    timeComparisonCards,
    refreshAll,
    loadFollowerTrend,
    onPeriodChange,
    onGroupChange,
    followerChartOption,
    platformChartOption,
  }
}
