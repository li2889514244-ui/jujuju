<template>
  <div class="dashboard">
    <!-- Hero: 标题 + 控制 -->
    <div class="dashboard__hero">
      <div class="dashboard__hero-left">
        <h2 class="dashboard__hero-title">账号总览</h2>
        <span class="dashboard__hero-update">最后更新 {{ lastUpdate }}</span>
      </div>
      <div class="dashboard__hero-controls">
        <el-radio-group v-model="period" size="small" @change="onPeriodChange">
          <el-radio-button value="day">日</el-radio-button>
          <el-radio-button value="week">周</el-radio-button>
          <el-radio-button value="month">月</el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="exportCSV" :disabled="accountRows.length === 0">导出 CSV</el-button>
        <el-button :icon="Refresh" size="small" circle @click="refreshAll" :loading="loading" />
      </div>
    </div>

    <!-- 分组切换 -->
    <div class="dashboard__tabs" v-if="accountGroups.length > 0">
      <el-radio-group v-model="selectedGroup" size="small" @change="onGroupChange">
        <el-radio-button value="all">全部 ({{ accountRows.length }})</el-radio-button>
        <el-radio-button v-for="g in accountGroups" :key="g.name" :value="g.name">
          {{ g.name || '未分组' }} ({{ g.accounts.length }})
        </el-radio-button>
      </el-radio-group>
    </div>

    <!-- KPI bento 网格: 2大 + 2小 -->
    <div class="dashboard__kpi">
      <StatCard
        v-for="(card, i) in groupSummaryCards"
        :key="card.label"
        :label="card.label"
        :value="card.rawValue"
        :formatter="formatNum"
        :trend="card.trend"
        :accent-color="card.color"
        :size="i < 2 ? 'lg' : 'md'"
        :delay="i * 80"
        class="stagger-item"
        :class="i < 2 ? 'kpi--large' : 'kpi--small'"
      />
    </div>

    <!-- 图表区 -->
    <div class="dashboard__charts" v-if="accountRows.length > 0">
      <GlassCard class="stagger-item">
        <template #header>
          <div class="chart-header">
            <span>粉丝增长趋势</span>
            <el-radio-group v-model="trendDays" size="small" @change="loadFollowerTrend">
              <el-radio-button :value="7">近7天</el-radio-button>
              <el-radio-button :value="30">近30天</el-radio-button>
            </el-radio-group>
          </div>
        </template>
        <DataChart :option="followerChartOption" :height="320" />
      </GlassCard>
      <GlassCard title="平台分布" class="stagger-item">
        <DataChart :option="platformChartOption" :height="320" />
      </GlassCard>
    </div>

    <!-- 账号卡片网格 -->
    <div class="dashboard__accounts" v-if="accountRows.length > 0">
      <div class="section-header">
        <span class="section-header__title">账号 · {{ accountRows.length }} 个</span>
        <router-link to="/accounts" class="section-header__link">查看全部 →</router-link>
      </div>
      <div class="account-grid">
        <router-link
          v-for="(acc, i) in displayAccounts"
          :key="acc.id"
          :to="`/accounts/${acc.id}`"
          class="account-card stagger-item"
          :style="{ animationDelay: `${i * 60}ms` }"
        >
          <el-avatar :size="44" :src="acc.avatar">{{ acc.nickname?.charAt(0) }}</el-avatar>
          <div class="account-card__info">
            <span class="account-card__name">{{ acc.nickname }}</span>
            <span class="account-card__platform">
              <PlatformBadge :platform="acc.platform" size="sm" />
            </span>
          </div>
          <div class="account-card__stat">
            <span class="account-card__stat-value">{{ formatNum(acc.followers) }}</span>
            <span class="account-card__stat-label">粉丝</span>
          </div>
        </router-link>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="dashboard__empty" v-if="accountRows.length === 0 && !loading">
      <div class="empty-state">
        <el-icon :size="48" color="#48484a"><Monitor /></el-icon>
        <h3>还没有绑定账号</h3>
        <p>连接你的社交媒体账号，开始矩阵管理</p>
        <el-button type="primary" @click="$router.push('/accounts')">添加账号</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { Refresh, Monitor } from '@element-plus/icons-vue'
import DataChart from '@/components/common/DataChart.vue'
import StatCard from '@/components/common/StatCard.vue'
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

  // === Hero ===
  &__hero {
    display: flex; justify-content: space-between; align-items: flex-start;
    &-left { display: flex; flex-direction: column; gap: $space-xs; }
    &-title { font-size: $text-hero; font-weight: 700; letter-spacing: -0.03em; margin: 0; color: var(--app-text-primary); }
    &-update { font-size: $text-caption; color: var(--app-text-tertiary); }
    &-controls { display: flex; align-items: center; gap: $space-sm; }
  }

  // === Group tabs ===
  &__tabs { margin-top: -#{$space-xl}; }

  // === KPI bento grid ===
  &__kpi {
    display: grid;
    grid-template-columns: 2fr 2fr 1fr 1fr;
    gap: $space-lg;
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

  // === Empty state ===
  &__empty {
    padding: $space-4xl 0;
    display: flex; justify-content: center;
  }
}

// === Section header ===
.section-header {
  display: flex; justify-content: space-between; align-items: baseline;
  &__title { font-size: $text-headline; font-weight: 600; color: var(--app-text-primary); }
  &__link { font-size: $text-body; color: #0a84ff; text-decoration: none; font-weight: 500;
    &:hover { text-decoration: underline; }
  }
}

// === Chart header ===
.chart-header { display: flex; justify-content: space-between; align-items: center; }

// === Account grid ===
.account-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: $space-md;
}

.account-card {
  display: flex; align-items: center; gap: $space-sm;
  padding: $space-lg;
  border-radius: $radius-lg;
  background: var(--app-glass-bg);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--app-border);
  text-decoration: none;
  transition: all 0.35s $ease-spring;
  cursor: pointer;

  &:hover {
    transform: translateY(-2px);
    border-color: var(--app-border-strong);
    box-shadow: var(--app-shadow-md);
  }

  &__info {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; gap: 2px;
  }
  &__name {
    font-size: $text-body; font-weight: 590; color: var(--app-text-primary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  &__platform { display: flex; align-items: center; }
  &__stat {
    display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
    flex-shrink: 0;
  }
  &__stat-value { font-size: $text-title; font-weight: 700; color: var(--app-text-primary); }
  &__stat-label { font-size: $text-micro; color: var(--app-text-tertiary); text-transform: uppercase; }
}

// === Empty state ===
.empty-state {
  display: flex; flex-direction: column; align-items: center; gap: $space-md;
  text-align: center;
  h3 { font-size: $text-headline; font-weight: 600; color: var(--app-text-primary); margin: 0; }
  p { font-size: $text-body; color: var(--app-text-tertiary); margin: 0; }
}
</style>
