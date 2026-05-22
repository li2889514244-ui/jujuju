import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { analyticsApi } from '@/api/analytics'
import { accountsApi } from '@/api/accounts'
import { getPlatformColor, getPlatformLabel } from '@/composables/usePlatform'
import type { DashboardAccount, AccountGroupSummary, SummaryCardData, DailyStatsMap } from '@/types'

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
      { label: '总粉丝', rawValue: totalFollowers, trend: null, color: '#E60012' },
      { label: '总播放量', rawValue: totalViews, trend: null, color: '#ff9f0a' },
      { label: '总点赞', rawValue: totalLikes, trend: null, color: '#30d158' },
      { label: '总互动', rawValue: totalInteract, trend: null, color: '#ff453a' },
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
      const wowChange = comp?.weekOverWeek?.change

      const [accRes, groupsRes] = await Promise.all([
        accountsApi.getList({ pageSize: 100, page: 1 }),
        accountsApi.getGroups().catch(() => ({ data: [] as Array<{ id: string; name: string }> })),
      ])
      const accData = accRes.data as {
        accounts?: Array<Record<string, unknown>>
        list?: Array<Record<string, unknown>>
      }
      const accs = accData?.accounts || accData?.list || []
      const groups: Record<string, string> = {}
      for (const g of (groupsRes.data as Array<{ id: string; name: string }>) || []) {
        if (g.id) groups[g.id] = g.name
      }

      let dailyMap: DailyStatsMap = {}
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
        const daily = dailyMap[a.id as string] || { views: 0, likes: 0, comments: 0, shares: 0 }
        return {
          id: a.id as string,
          nickname: (a.nickname as string) || '未命名',
          avatar: (a.avatar as string) || '',
          platform: a.platform as string,
          groupName:
            (a.group as { name?: string })?.name ||
            groups[a.groupId as string] ||
            '',
          followers: (a.followers as number) || 0,
          views: daily.views,
          likes: daily.likes,
          comments: daily.comments,
          shares: daily.shares,
          postCount: (a._count as { posts?: number })?.posts || 0,
          hasCookies: a.hasCookies as boolean,
          tokenStatus:
            (a.tokenStatus as string) || ((a.hasCookies as boolean) ? 'valid' : 'unknown'),
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

      const byPlatform = ov.accounts?.byPlatform || {}
      platformDistribution.value = Object.entries(byPlatform)
        .filter(([, count]) => (count as number) > 0)
        .map(([key, count]) => ({
          value: count as number,
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
      followerTrendData.value = (res.data || []).map((d: any) => d.value || 0)
    } catch {
      followerTrendData.value = []
    }
  }

  function onPeriodChange() {
    refreshAll()
  }
  function onGroupChange() {}

  const neonColors = ['#00d4ff', '#7c3aed', '#ff3366', '#00e396', '#ffb800', '#fb7299']

  const followerChartOption = computed(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(16, 24, 48, 0.95)',
      borderColor: 'rgba(0, 212, 255, 0.2)',
      textStyle: { color: '#e8eaed', fontSize: 12 },
    },
    grid: { left: 50, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: Array.from({ length: trendDays.value }, (_, i) =>
        dayjs().subtract(trendDays.value - 1 - i, 'day').format('MM-DD'),
      ),
      axisLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.15)' } },
      axisTick: { show: false },
      axisLabel: { color: '#5a6680', fontSize: 11 },
    },
    yAxis: {
      type: 'value' as const,
      splitLine: { lineStyle: { color: 'rgba(0, 212, 255, 0.06)' } },
      axisLabel: { color: '#5a6680', fontSize: 11 },
    },
    series:
      followerTrendData.value.length > 0
        ? [{
            name: '粉丝',
            type: 'line' as const,
            smooth: true,
            symbol: 'circle',
            symbolSize: 4,
            lineStyle: {
              width: 2,
              shadowBlur: 12,
              shadowColor: 'rgba(0, 212, 255, 0.4)',
            },
            itemStyle: { color: '#00d4ff' },
            areaStyle: {
              color: {
                type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: 'rgba(0, 212, 255, 0.25)' },
                  { offset: 1, color: 'rgba(0, 212, 255, 0)' },
                ],
              },
            },
            data: followerTrendData.value,
          }]
        : [],
  }))

  const platformChartOption = computed(() => ({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: 'rgba(16, 24, 48, 0.95)',
      borderColor: 'rgba(0, 212, 255, 0.2)',
      textStyle: { color: '#e8eaed', fontSize: 12 },
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#8892b0', fontSize: 11 },
    },
    series: [{
      type: 'pie' as const,
      radius: ['45%', '75%'],
      center: ['50%', '45%'],
      itemStyle: {
        borderRadius: 4,
        borderColor: '#0a0e1a',
        borderWidth: 3,
        shadowBlur: 12,
        shadowColor: 'rgba(0, 212, 255, 0.3)',
      },
      label: { show: false },
      emphasis: {
        label: { show: true, fontSize: 14, fontWeight: 'bold', color: '#e8eaed' },
        itemStyle: { shadowBlur: 20, shadowColor: 'rgba(0, 212, 255, 0.5)' },
      },
      data:
        platformDistribution.value.length > 0
          ? platformDistribution.value
          : [{ value: 0, name: '暂无数据', itemStyle: { color: '#3d4a60' } }],
    }],
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
    refreshAll,
    loadFollowerTrend,
    onPeriodChange,
    onGroupChange,
    followerChartOption,
    platformChartOption,
  }
}
