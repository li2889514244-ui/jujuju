<template>
  <div class="dashboard">
    <el-row :gutter="20" class="dashboard__cards">
      <el-col :xs="12" :sm="6" v-for="card in overviewCards" :key="card.title">
        <el-card shadow="hover" class="dashboard__card">
          <div class="dashboard__card-header">
            <span class="dashboard__card-title">{{ card.title }}</span>
            <el-icon :size="24" :style="{ color: card.color }"><component :is="card.icon" /></el-icon>
          </div>
          <div class="dashboard__card-value">{{ card.value }}</div>
          <div class="dashboard__card-trend" :class="card.trend > 0 ? 'up' : 'down'">
            <el-icon><Top v-if="card.trend > 0" /><Bottom v-else /></el-icon>
            {{ Math.abs(card.trend) }}% 较昨日
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="dashboard__charts">
      <el-col :xs="24" :lg="16">
        <el-card shadow="hover">
          <template #header>
            <div class="dashboard__chart-header">
              <span>粉丝增长趋势</span>
              <el-radio-group v-model="trendDays" size="small">
                <el-radio-button :value="7">近7天</el-radio-button>
                <el-radio-button :value="30">近30天</el-radio-button>
                <el-radio-button :value="90">近90天</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <DataChart :option="followerChartOption" :height="350" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="8">
        <el-card shadow="hover">
          <template #header>平台分布</template>
          <DataChart :option="platformChartOption" :height="350" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="dashboard__bottom">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <div class="dashboard__chart-header">
              <span>最近发布任务</span>
              <el-button text type="primary" @click="$router.push('/publish')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="recentTasks" stripe style="width: 100%">
            <el-table-column prop="contentTitle" label="内容" show-overflow-tooltip />
            <el-table-column prop="platform" label="平台" width="80">
              <template #default="{ row }"><PlatformIcon :platform="row.platform" /></template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }"><StatusBadge :status="row.status" type="publish" /></template>
            </el-table-column>
            <el-table-column prop="createdAt" label="时间" width="160">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>系统通知</template>
          <div class="dashboard__notifications">
            <div v-for="(notice, index) in notifications" :key="index" class="dashboard__notice-item">
              <el-icon :style="{ color: notice.color }"><component :is="notice.icon" /></el-icon>
              <div class="dashboard__notice-content">
                <p>{{ notice.message }}</p><span>{{ notice.time }}</span>
              </div>
            </div>
            <el-empty v-if="notifications.length === 0" description="暂无通知" />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import dayjs from 'dayjs'
import DataChart from '@/components/common/DataChart.vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { analyticsApi } from '@/api/analytics'
import { contentApi } from '@/api/content'
import type { PublishTask } from '@/types'

const trendDays = ref(7)
const loading = ref(false)
const overviewCards = ref([
  { title: '账号总数', value: '0', icon: 'UserFilled', color: '#409eff', trend: 0 },
  { title: '总粉丝数', value: '0', icon: 'Star', color: '#e6a23c', trend: 0 },
  { title: '总互动数', value: '0', icon: 'DataLine', color: '#67c23a', trend: 0 },
  { title: '发布总数', value: '0', icon: 'List', color: '#f56c6c', trend: 0 },
])
const recentTasks = ref<PublishTask[]>([])
const notifications = ref<{ message: string; icon: string; color: string; time: string }[]>([])
const platformDistribution = ref<{ value: number; name: string; itemStyle: { color: string } }[]>([])

const PLATFORM_COLORS: Record<string, string> = { DOUYIN: '#000', KUAISHOU: '#ff4906', XIAOHONGSHU: '#ff2442', BILIBILI: '#fb7299', WECHAT_VIDEO: '#07c160', WEIBO: '#ff8200', TIKTOK: '#010101' }
const PLATFORM_CN: Record<string, string> = { DOUYIN: '抖音', KUAISHOU: '快手', XIAOHONGSHU: '小红书', BILIBILI: 'B站', WECHAT_VIDEO: '视频号', WEIBO: '微博', TIKTOK: 'TikTok' }

function formatNumber(num: number): string {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿'
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  return num.toLocaleString()
}

// 粉丝趋势 — 真实数据
const followerTrendData = ref<number[]>([])
const followerChartLoading = ref(false)

async function loadFollowerTrend() {
  followerChartLoading.value = true
  try {
    const res = await analyticsApi.getFollowerTrend({ days: trendDays.value })
    followerTrendData.value = (res.data || []).map((d: any) => d.value || 0)
  } catch { followerTrendData.value = [] }
  followerChartLoading.value = false
}

const followerChartOption = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  grid: { left: 50, right: 20, top: 40, bottom: 30 },
  xAxis: { type: 'category' as const, data: Array.from({ length: trendDays.value }, (_, i) => dayjs().subtract(trendDays.value - 1 - i, 'day').format('MM-DD')) },
  yAxis: { type: 'value' as const, name: '新增粉丝' },
  series: followerTrendData.value.length > 0 ? [{ name: '粉丝', type: 'line' as const, smooth: true, areaStyle: { opacity: 0.2 }, data: followerTrendData.value }] : [],
}))

const platformChartOption = computed(() => ({
  tooltip: { trigger: 'item' as const }, legend: { bottom: 0 },
  series: [{ type: 'pie' as const, radius: ['40%', '70%'], avoidLabelOverlap: false, itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 }, label: { show: false }, emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' as const } }, data: platformDistribution.value.length > 0 ? platformDistribution.value : [{ value: 0, name: '暂无数据' }] }],
}))

function formatTime(time: string) { return dayjs(time).format('MM-DD HH:mm') }

async function fetchDashboardData() {
  loading.value = true
  try {
    const res = await analyticsApi.getOverview(); const data = res.data as any
    overviewCards.value = [
      { title: '账号总数', value: formatNumber(data.accounts?.total || 0), icon: 'UserFilled', color: '#409eff', trend: 0 },
      { title: '总粉丝数', value: formatNumber(data.accounts?.totalFollowers || 0), icon: 'Star', color: '#e6a23c', trend: 0 },
      { title: '总互动数', value: formatNumber((data.engagement?.totalLikes || 0) + (data.engagement?.totalComments || 0) + (data.engagement?.totalShares || 0)), icon: 'DataLine', color: '#67c23a', trend: 0 },
      { title: '发布总数', value: formatNumber(data.posts?.total || 0), icon: 'List', color: '#f56c6c', trend: 0 },
    ]
    const byPlatform = data.accounts?.byPlatform || {}
    platformDistribution.value = Object.entries(byPlatform).map(([key, count]) => ({ value: count as number, name: PLATFORM_CN[key] || key, itemStyle: { color: PLATFORM_COLORS[key] || '#999' } }))
  } catch (e) { console.error(e) }
  try {
    const r = await contentApi.getList({ page: 1, limit: 5, status: 'PUBLISHED' }); const d = r.data as any
    if (d?.posts) recentTasks.value = d.posts.map((p: any) => ({ id: p.id, contentId: p.id, contentTitle: p.title || '无标题', accountId: p.accountId, accountNickname: p.account?.nickname || '', platform: (p.account?.platform || '').toLowerCase(), status: p.status === 'PUBLISHED' ? 'success' : p.status === 'FAILED' ? 'failed' : 'publishing', scheduledAt: p.publishAt, publishedAt: p.updatedAt, errorMessage: p.errorMsg, createdAt: p.createdAt }))
  } catch (e) { console.error(e) }
  loading.value = false
}

onMounted(() => { fetchDashboardData(); loadFollowerTrend() })
watch(trendDays, () => loadFollowerTrend())
</script>

<style lang="scss" scoped>
.dashboard {
  &__cards { margin-bottom: 20px; }
  &__card {
    .el-card__body { padding: 20px; }
    &-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    &-title { font-size: 14px; color: #909399; }
    &-value { font-size: 28px; font-weight: 700; color: #303133; margin-bottom: 8px; }
    &-trend { font-size: 12px; display: flex; align-items: center; gap: 4px;
      &.up { color: #67c23a; }
      &.down { color: #f56c6c; }
    }
  }
  &__charts { margin-bottom: 20px; }
  &__chart-header { display: flex; justify-content: space-between; align-items: center; }
  &__bottom { margin-bottom: 20px; }
  &__notifications { max-height: 320px; overflow-y: auto; }
  &__notice-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f0f0f0;
    &:last-child { border-bottom: none; }
  }
  &__notice-content { flex: 1;
    p { font-size: 14px; color: #303133; margin-bottom: 4px; }
    span { font-size: 12px; color: #c0c4cc; }
  }
}
</style>
