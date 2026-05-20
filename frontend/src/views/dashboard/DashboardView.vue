<template>
  <div class="dashboard">
    <!-- Hero KPI: 唯一的视觉焦点 -->
    <div class="dashboard__hero-kpi" v-if="accountRows.length > 0">
      <span class="hero-kpi__value">{{ formatNum(groupSummaryCards[0]?.rawValue || 0) }}</span>
      <span class="hero-kpi__label">总粉丝</span>
    </div>

    <!-- 次级指标 + 操作（同一行，低调） -->
    <div class="dashboard__sub-row" v-if="accountRows.length > 0">
      <div class="dashboard__sub-kpis">
        <span class="sub-kpi" v-for="card in groupSummaryCards.slice(1)" :key="card.label">
          <b>{{ formatNum(card.rawValue) }}</b>
          <small>{{ card.label }}</small>
        </span>
      </div>
      <div class="dashboard__sub-actions">
        <el-radio-group v-model="period" size="small" @change="onPeriodChange">
          <el-radio-button value="day">日</el-radio-button>
          <el-radio-button value="week">周</el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="exportCSV" :disabled="accountRows.length === 0">导出</el-button>
        <el-button :icon="Refresh" size="small" circle @click="refreshAll" :loading="loading" />
      </div>
    </div>

    <!-- 分组切换（有分组时才显示） -->
    <div class="dashboard__groups" v-if="accountGroups.length > 1">
      <el-select v-model="selectedGroup" size="small" @change="onGroupChange" placeholder="全部" style="width: 120px">
        <el-option label="全部" value="all" />
        <el-option v-for="g in accountGroups" :key="g.name" :label="g.name" :value="g.name" />
      </el-select>
    </div>

    <!-- 图表区 -->
    <div class="dashboard__charts" v-if="accountRows.length > 0">
      <GlassCard class="stagger-item">
        <template #header>
          <div class="chart-header">
            <span>增长趋势</span>
            <el-radio-group v-model="trendDays" size="small" @change="loadFollowerTrend">
              <el-radio-button :value="7">7天</el-radio-button>
              <el-radio-button :value="30">30天</el-radio-button>
            </el-radio-group>
          </div>
        </template>
        <DataChart :option="followerChartOption" :height="280" />
      </GlassCard>
      <GlassCard title="平台分布" class="stagger-item">
        <DataChart :option="platformChartOption" :height="280" />
      </GlassCard>
    </div>

    <!-- 账号卡片网格 -->
    <div class="dashboard__accounts" v-if="accountRows.length > 0">
      <div class="section-header">
        <span class="section-header__title">账号</span>
        <span class="section-header__count">{{ accountRows.length }}</span>
        <router-link to="/accounts" class="section-header__link">全部 →</router-link>
      </div>
      <div class="account-grid">
        <router-link
          v-for="(acc, i) in displayAccounts"
          :key="acc.id"
          :to="`/accounts/${acc.id}`"
          class="account-card stagger-item"
        >
          <el-avatar :size="36" :src="acc.avatar">{{ acc.nickname?.charAt(0) }}</el-avatar>
          <span class="account-card__name">{{ acc.nickname }}</span>
          <PlatformBadge :platform="acc.platform" size="sm" />
        </router-link>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="dashboard__empty" v-if="accountRows.length === 0 && !loading">
      <el-button type="primary" size="large" @click="$router.push('/accounts')">添加第一个账号</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { Refresh } from '@element-plus/icons-vue'
import DataChart from '@/components/common/DataChart.vue'
import GlassCard from '@/components/common/GlassCard.vue'
import PlatformBadge from '@/components/common/PlatformBadge.vue'
import { analyticsApi } from '@/api/analytics'
import { accountsApi } from '@/api/accounts'
import { getPlatformColor, getPlatformLabel } from '@/composables/usePlatform'

const period = ref('week')
const loading = ref(false)
const lastUpdate = ref('')
const trendDays = ref(7)

interface SummaryCardData {
  label: string
  rawValue: number
  trend: number | null
  color: string
}

const summaryCards = ref<SummaryCardData[]>([
  { label: '总粉丝', rawValue: 0, trend: null, color: '#0a84ff' },
  { label: '总播放量', rawValue: 0, trend: null, color: '#ff9f0a' },
  { label: '总点赞', rawValue: 0, trend: null, color: '#30d158' },
  { label: '总互动', rawValue: 0, trend: null, color: '#ff453a' },
])
const selectedGroup = ref('all')

interface AccountRow {
  id: string
  nickname: string
  avatar: string
  platform: string
  groupName: string
  followers: number
  views: number
  likes: number
  comments: number
  shares: number
  postCount: number
  hasCookies: boolean
  tokenStatus: string
}

const accountRows = ref<AccountRow[]>([])
const accountGroups = ref<{ name: string; accounts: AccountRow[]; totalFollowers: number; totalViews: number; totalLikes: number }[]>([])
const platformDistribution = ref<{ value: number; name: string; itemStyle: { color: string } }[]>([])
const followerTrendData = ref<number[]>([])

const displayAccounts = computed(() => accountRows.value.slice(0, 8))

const displayGroups = computed(() => {
  if (selectedGroup.value === 'all') return accountGroups.value
  return accountGroups.value.filter(g => g.name === selectedGroup.value)
})
const filteredRows = computed(() => {
  if (selectedGroup.value === 'all') return accountRows.value
  return accountRows.value.filter(r => (r as any).groupName === selectedGroup.value)
})
const groupSummaryCards = computed<SummaryCardData[]>(() => {
  const rows = filteredRows.value
  const totalFollowers = rows.reduce((s, r) => s + r.followers, 0)
  const totalViews = rows.reduce((s, r) => s + r.views, 0)
  const totalLikes = rows.reduce((s, r) => s + r.likes, 0)
  const totalInteract = rows.reduce((s, r) => s + r.comments + r.shares, 0)
  return [
    { label: '总粉丝', rawValue: totalFollowers, trend: null, color: '#0a84ff' },
    { label: '总播放量', rawValue: totalViews, trend: null, color: '#ff9f0a' },
    { label: '总点赞', rawValue: totalLikes, trend: null, color: '#30d158' },
    { label: '总互动', rawValue: totalInteract, trend: null, color: '#ff453a' },
  ]
})
function onGroupChange() {}

function formatNum(num: number): string {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿'
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  if (num === 0) return '-'
  return num.toLocaleString()
}

async function refreshAll() {
  loading.value = true
  try {
    const [overviewRes, compRes] = await Promise.all([
      analyticsApi.getOverview(),
      analyticsApi.getComparison().catch(() => null),
    ])
    const ov = overviewRes.data

    const comp = compRes?.data
    const wowChange = comp?.weekOverWeek?.change
    summaryCards.value = [
      { label: '总粉丝', rawValue: ov.accounts?.totalFollowers || 0, trend: wowChange?.followers ?? null, color: '#0a84ff' },
      { label: '总播放量', rawValue: ov.engagement?.totalViews || 0, trend: wowChange?.views ?? null, color: '#ff9f0a' },
      { label: '总点赞', rawValue: ov.engagement?.totalLikes || 0, trend: wowChange?.likes ?? null, color: '#30d158' },
      { label: '总互动', rawValue: (ov.engagement?.totalComments || 0) + (ov.engagement?.totalShares || 0), trend: null, color: '#ff453a' },
    ]

    const accRes = await accountsApi.getList({ pageSize: 100, page: 1 } as any)
    const accData = accRes.data
    const accs = accData?.accounts || accData?.list || []

    let dailyMap: Record<string, any> = {}
    try {
      const reportRes = await analyticsApi.getReport()
      const rptAccs = reportRes.data?.accounts || []
      for (const a of rptAccs) {
        const allStats = a.dailyStats || []
        dailyMap[a.id] = {
          views: allStats.reduce((sum: number, s: any) => sum + (s.views || 0), 0),
          likes: allStats.reduce((sum: number, s: any) => sum + (s.likes || 0), 0),
          comments: allStats.reduce((sum: number, s: any) => sum + (s.comments || 0), 0),
          shares: allStats.reduce((sum: number, s: any) => sum + (s.shares || 0), 0),
        }
      }
    } catch { /* daily stats might be empty */ }

    accountRows.value = accs.map((a: any) => {
      const daily = dailyMap[a.id] || { views: 0, likes: 0, comments: 0, shares: 0 }
      return {
        id: a.id,
        nickname: a.nickname || '未命名',
        avatar: a.avatar || '',
        platform: a.platform,
        groupName: a.group?.name || '',
        followers: a.followers || 0,
        views: daily.views,
        likes: daily.likes,
        comments: daily.comments,
        shares: daily.shares,
        postCount: a._count?.posts || 0,
        hasCookies: a.hasCookies,
        tokenStatus: a.tokenStatus || (a.hasCookies ? 'valid' : 'unknown'),
      }
    })

    const groupMap: Record<string, AccountRow[]> = {}
    for (const row of accountRows.value) {
      const gName = (row as any).groupName || '未分组'
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
  } catch { /* silent */ }
  loading.value = false
}

async function loadFollowerTrend() {
  try {
    const res = await analyticsApi.getFollowerTrend({ days: trendDays.value })
    followerTrendData.value = (res.data || []).map((d: any) => d.value || 0)
  } catch { followerTrendData.value = [] }
}

function onPeriodChange() { refreshAll() }

const followerChartOption = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  grid: { left: 50, right: 20, top: 20, bottom: 30 },
  xAxis: { type: 'category' as const, data: Array.from({ length: trendDays.value }, (_, i) => dayjs().subtract(trendDays.value - 1 - i, 'day').format('MM-DD')) },
  yAxis: { type: 'value' as const },
  series: followerTrendData.value.length > 0 ? [{ name: '粉丝', type: 'line' as const, smooth: true, areaStyle: { opacity: 0.15 }, data: followerTrendData.value }] : [],
}))

const platformChartOption = computed(() => ({
  tooltip: { trigger: 'item' as const },
  legend: { bottom: 0 },
  series: [{
    type: 'pie' as const, radius: ['40%', '70%'],
    itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
    label: { show: false },
    emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' as const } },
    data: platformDistribution.value.length > 0 ? platformDistribution.value : [{ value: 0, name: '暂无数据' }],
  }],
}))

function exportCSV() {
  const headers = ['账号', '平台', '粉丝', '播放量', '点赞', '评论', '分享', '内容数', '状态']
  const rows = accountRows.value.map(r => [
    r.nickname, r.platform, r.followers, r.views, r.likes, r.comments, r.shares, r.postCount, r.tokenStatus === 'valid' ? '已连接' : r.tokenStatus === 'expiring_soon' ? '即将过期' : r.tokenStatus === 'expired' ? '已失效' : r.hasCookies ? '在线' : '待授权'
  ])
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `账号数据_${dayjs().format('YYYY-MM-DD')}.csv`; a.click()
  URL.revokeObjectURL(url)
}

onMounted(() => { refreshAll(); loadFollowerTrend() })
</script>

<style lang="scss" scoped>
.dashboard {
  display: flex; flex-direction: column; gap: $section-gap;

  // === Hero KPI — THE focal point ===
  &__hero-kpi {
    display: flex; flex-direction: column; align-items: center; gap: $space-sm;
    padding: $space-3xl 0 $space-xl;
  }

  // === Sub KPIs + actions ===
  &__sub-row {
    display: flex; justify-content: center; align-items: center; gap: $space-2xl;
  }
  &__sub-kpis {
    display: flex; gap: $space-2xl;
  }
  &__sub-actions {
    display: flex; align-items: center; gap: $space-sm;
  }

  // === Groups ===
  &__groups {
    display: flex; justify-content: center;
  }

  // === Charts ===
  &__charts {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: $space-lg;
  }

  // === Account cards ===
  &__accounts {
    display: flex; flex-direction: column; gap: $space-lg;
  }

  // === Empty ===
  &__empty {
    display: flex; justify-content: center; align-items: center;
    min-height: 60vh;
  }
}

// === Hero number ===
.hero-kpi {
  &__value {
    font-size: 80px; font-weight: 700;
    color: var(--app-text-primary);
    letter-spacing: -0.04em; line-height: 1;
    font-feature-settings: 'tnum'; font-variant-numeric: tabular-nums;
  }
  &__label {
    font-size: $text-body;
    color: var(--app-text-tertiary);
    text-transform: uppercase; letter-spacing: 0.1em;
  }
}

// === Secondary KPI line ===
.sub-kpi {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  b { font-size: $text-headline; font-weight: 700; color: var(--app-text-primary); font-feature-settings: 'tnum'; }
  small { font-size: $text-micro; color: var(--app-text-tertiary); text-transform: uppercase; }
}

// === Section header ===
.section-header {
  display: flex; align-items: baseline; gap: $space-sm;
  &__title { font-size: $text-body; font-weight: 600; color: var(--app-text-primary); text-transform: uppercase; letter-spacing: 0.06em; }
  &__count { font-size: $text-caption; color: var(--app-text-tertiary); }
  &__link { font-size: $text-caption; color: #0a84ff; text-decoration: none; font-weight: 500; margin-left: auto;
    &:hover { text-decoration: underline; }
  }
}

// === Chart header ===
.chart-header { display: flex; justify-content: space-between; align-items: center; }

// === Account grid ===
.account-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: $space-sm;
}

.account-card {
  display: flex; align-items: center; gap: $space-sm;
  padding: $space-md $space-lg;
  border-radius: $radius-md;
  background: var(--app-glass-bg);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--app-border);
  text-decoration: none;
  transition: all 0.2s $ease-out;
  cursor: pointer;

  &:hover {
    border-color: #0a84ff;
    background: rgba(#0a84ff, 0.04);
  }

  &__name {
    flex: 1;
    font-size: $text-body; font-weight: 590; color: var(--app-text-primary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    min-width: 0;
  }
}
</style>
