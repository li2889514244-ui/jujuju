<template>
  <div class="dashboard">
    <!-- 顶部：标题 + 时间维度 -->
    <div class="dashboard__header">
      <div class="dashboard__title">
        <h2>账号总览</h2>
        <span class="dashboard__update">最后更新: {{ lastUpdate }}</span>
      </div>
      <div class="dashboard__controls">
        <el-radio-group v-model="period" size="small" @change="onPeriodChange">
          <el-radio-button value="day">日</el-radio-button>
          <el-radio-button value="week">周</el-radio-button>
          <el-radio-button value="month">月</el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="exportCSV" :disabled="accountRows.length === 0">导出 CSV</el-button>
        <el-button :icon="Refresh" size="small" circle @click="refreshAll" :loading="loading" />
      </div>
    </div>

    <!-- 汇总卡片 -->
    <el-row :gutter="16" class="dashboard__summary">
      <el-col :xs="12" :sm="6" v-for="card in summaryCards" :key="card.label">
        <div class="summary-card" :style="{ borderTopColor: card.color }">
          <div class="summary-card__label">{{ card.label }}</div>
          <div class="summary-card__value">{{ card.value }}</div>
          <div class="summary-card__trend" v-if="card.trend !== null" :class="card.trend > 0 ? 'trend--up' : card.trend < 0 ? 'trend--down' : ''">
            {{ card.trend > 0 ? '↑' : '↓' }} {{ Math.abs(card.trend) }}% 较上周
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 账号分组展示 -->
    <div class="dashboard__groups">
      <div v-if="accountGroups.length === 0 && !loading" class="dashboard__empty">
        <el-empty description="还没有绑定账号">
          <el-button type="primary" @click="$router.push('/accounts')">添加平台账号</el-button>
        </el-empty>
      </div>
      <div v-for="group in accountGroups" :key="group.name" class="group-card">
        <div class="group-card__header">
          <div class="group-card__title">
            <span class="group-card__name">{{ group.name || '未分组' }}</span>
            <el-tag size="small">{{ group.accounts.length }} 个账号</el-tag>
          </div>
          <div class="group-card__stats">
            <span>粉丝 <b>{{ formatNum(group.totalFollowers) }}</b></span>
            <span>播放 <b>{{ formatNum(group.totalViews) }}</b></span>
            <span>点赞 <b>{{ formatNum(group.totalLikes) }}</b></span>
          </div>
        </div>
        <el-table :data="group.accounts" stripe size="small">
          <el-table-column label="账号" min-width="160">
            <template #default="{ row }">
              <div class="account-cell">
                <el-avatar :size="32" :src="row.avatar">{{ row.nickname?.charAt(0) }}</el-avatar>
                <div class="account-cell__info">
                  <span class="account-cell__name">{{ row.nickname }}</span>
                  <span class="account-cell__platform">
                    <PlatformIcon :platform="row.platform" />
                    {{ PLATFORM_CN[row.platform] || row.platform }}
                  </span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="粉丝" width="90" prop="followers" align="right">
            <template #default="{ row }">{{ formatNum(row.followers) }}</template>
          </el-table-column>
          <el-table-column label="播放量" width="90" prop="views" align="right">
            <template #default="{ row }">{{ formatNum(row.views) }}</template>
          </el-table-column>
          <el-table-column label="点赞" width="80" prop="likes" align="right">
            <template #default="{ row }">{{ formatNum(row.likes) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.hasCookies ? 'success' : 'warning'" size="small">
                {{ row.hasCookies ? '在线' : '待授权' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="70" align="center">
            <template #default="{ row }">
              <el-button text type="primary" size="small" @click="$router.push(`/accounts/${row.id}`)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 粉丝趋势图 -->
    <el-row :gutter="16" class="dashboard__charts" v-if="accountRows.length > 0">
      <el-col :xs="24" :lg="16">
        <el-card shadow="hover">
          <template #header>
            <div class="dashboard__chart-header">
              <span>粉丝增长趋势</span>
              <el-radio-group v-model="trendDays" size="small" @change="loadFollowerTrend">
                <el-radio-button :value="7">近7天</el-radio-button>
                <el-radio-button :value="30">近30天</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <DataChart :option="followerChartOption" :height="300" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="8">
        <el-card shadow="hover">
          <template #header>平台分布</template>
          <DataChart :option="platformChartOption" :height="300" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { Refresh } from '@element-plus/icons-vue'
import DataChart from '@/components/common/DataChart.vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import { analyticsApi } from '@/api/analytics'
import { accountsApi } from '@/api/accounts'

const PLATFORM_COLORS: Record<string, string> = { DOUYIN: '#000', KUAISHOU: '#ff4906', XIAOHONGSHU: '#ff2442', BILIBILI: '#fb7299', WECHAT_VIDEO: '#07c160', WEIBO: '#ff8200', TIKTOK: '#010101' }
const PLATFORM_CN: Record<string, string> = { DOUYIN: '抖音', KUAISHOU: '快手', XIAOHONGSHU: '小红书', BILIBILI: 'B站', WECHAT_VIDEO: '视频号', WEIBO: '微博', TIKTOK: 'TikTok' }

const period = ref('week')
const loading = ref(false)
const lastUpdate = ref('')
const trendDays = ref(7)

const summaryCards = ref([
  { label: '总粉丝', value: '0', trend: null as number | null, color: '#409eff' },
  { label: '总播放量', value: '0', trend: null as number | null, color: '#e6a23c' },
  { label: '总点赞', value: '0', trend: null as number | null, color: '#67c23a' },
  { label: '总互动', value: '0', trend: null as number | null, color: '#f56c6c' },
])

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
}

const accountRows = ref<AccountRow[]>([])
const accountGroups = ref<{ name: string; accounts: AccountRow[]; totalFollowers: number; totalViews: number; totalLikes: number }[]>([])
const platformDistribution = ref<{ value: number; name: string; itemStyle: { color: string } }[]>([])
const followerTrendData = ref<number[]>([])

function formatNum(num: number): string {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿'
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  if (num === 0) return '-'
  return num.toLocaleString()
}

async function refreshAll() {
  loading.value = true
  try {
    // 1. Load overview + comparison in parallel
    const [overviewRes, compRes] = await Promise.all([
      analyticsApi.getOverview(),
      analyticsApi.getComparison().catch(() => null),
    ])
    const ov = overviewRes.data

    const comp = compRes?.data
    const wowChange = comp?.weekOverWeek?.change
    summaryCards.value = [
      { label: '总粉丝', value: formatNum(ov.accounts?.totalFollowers || 0), trend: wowChange?.followers ?? null, color: '#409eff' },
      { label: '总播放量', value: formatNum(ov.engagement?.totalViews || 0), trend: wowChange?.views ?? null, color: '#e6a23c' },
      { label: '总点赞', value: formatNum(ov.engagement?.totalLikes || 0), trend: wowChange?.likes ?? null, color: '#67c23a' },
      { label: '总互动', value: formatNum((ov.engagement?.totalComments || 0) + (ov.engagement?.totalShares || 0)), trend: null, color: '#f56c6c' },
    ]

    // 2. Load accounts for table
    const accRes = await accountsApi.getList({ pageSize: 100, page: 1 } as any)
    const accData = accRes.data
    const accs = accData?.accounts || accData?.list || []

    // 3. Load daily stats via report API — aggregate all daily stats per account
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

    // 4. Merge into rows
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
      }
    })

    // Group accounts by group name
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
        name: PLATFORM_CN[key] || key,
        itemStyle: { color: PLATFORM_COLORS[key] || '#999' },
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
    r.nickname, r.platform, r.followers, r.views, r.likes, r.comments, r.shares, r.postCount, r.hasCookies ? '在线' : '待授权'
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
  &__header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 20px;
  }
  &__title {
    h2 { margin: 0 0 4px 0; font-size: 20px; font-weight: 600; }
  }
  &__update { font-size: 12px; color: #909399; }
  &__controls { display: flex; align-items: center; gap: 12px; }

  &__summary { margin-bottom: 20px; }

  &__table-card { margin-bottom: 20px; }
  &__table-header { display: flex; align-items: baseline; gap: 12px; }
  &__table-hint { font-size: 12px; color: #a7a7a7; }

  &__charts { margin-bottom: 20px; }
  &__chart-header { display: flex; justify-content: space-between; align-items: center; }
}

.summary-card {
  background: #fff; border-radius: 8px; padding: 20px;
  border-top: 3px solid #409eff;
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
  &__label { font-size: 13px; color: #909399; margin-bottom: 8px; }
  &__value { font-size: 26px; font-weight: 700; color: #303133; }
  &__trend { font-size: 12px; margin-top: 8px; font-weight: 500; }
}

.trend--up { color: #67c23a; }
.trend--down { color: #f56c6c; }

.account-cell {
  display: flex; align-items: center; gap: 10px;
  &__info { display: flex; flex-direction: column; }
  &__name { font-size: 14px; font-weight: 500; }
  &__platform { font-size: 12px; color: #909399; display: flex; align-items: center; gap: 4px; }
}

.dashboard__groups { display: flex; flex-direction: column; gap: 16px; }
.dashboard__empty { padding: 40px 0; }
.group-card {
  background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.06); overflow: hidden;
  &__header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid #ebeef5; background: #fafafa; }
  &__title { display: flex; align-items: center; gap: 10px; }
  &__name { font-size: 15px; font-weight: 600; color: #303133; }
  &__stats { display: flex; gap: 20px; font-size: 13px; color: #606266;
    b { color: #303133; margin-left: 4px; }
  }
}
</style>
