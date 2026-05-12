<template>
  <div class="analytics">
    <!-- Filters -->
    <el-card shadow="hover" class="analytics__filter">
      <el-form :inline="true">
        <el-form-item label="时间范围">
          <el-select v-model="days" style="width: 140px">
            <el-option label="近7天" :value="7" />
            <el-option label="近30天" :value="30" />
            <el-option label="近90天" :value="90" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台">
          <el-select v-model="platform" placeholder="全部平台" clearable style="width: 140px">
            <el-option label="全部" value="" />
            <el-option v-for="(label, key) in PLATFORM_LABELS" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="refreshData">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Charts -->
    <el-row :gutter="20" class="analytics__charts">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>粉丝增长趋势</template>
          <DataChart :option="followerChart" :height="350" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>互动率趋势</template>
          <DataChart :option="engagementChart" :height="350" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="analytics__charts">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>发布效果</template>
          <DataChart :option="publishEffectChart" :height="350" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>平台对比</template>
          <DataChart :option="platformCompareChart" :height="350" />
        </el-card>
      </el-col>
    </el-row>

    <!-- Platform Stats Table -->
    <el-card shadow="hover">
      <template #header>平台数据明细</template>
      <el-table :data="platformStats" stripe>
        <el-table-column label="平台" width="100">
          <template #default="{ row }">
            <PlatformIcon :platform="row.platform" show-label />
          </template>
        </el-table-column>
        <el-table-column prop="accounts" label="账号数" width="100" />
        <el-table-column prop="followers" label="粉丝数" width="120">
          <template #default="{ row }">{{ row.followers?.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="likes" label="获赞数" width="120">
          <template #default="{ row }">{{ row.likes?.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="publishes" label="发布数" width="100" />
        <el-table-column prop="engagementRate" label="互动率" width="100">
          <template #default="{ row }">{{ row.engagementRate }}%</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 数据同比环比 -->
    <el-card shadow="hover" class="analytics__comparison">
      <template #header>数据对比（同比/环比）</template>
      <el-row :gutter="20">
        <el-col :xs="24" :md="8" v-for="(item, key) in comparisonLabels" :key="key">
          <div class="comparison-card">
            <div class="comparison-card__title">{{ item.label }}</div>
            <div class="comparison-card__metrics" v-if="comparison">
              <div class="comparison-metric" v-for="metric in metricKeys" :key="metric">
                <span class="comparison-metric__label">{{ metricLabels[metric] }}</span>
                <span class="comparison-metric__value">{{ formatNum(comparison[key]?.current?.[metric]) }}</span>
                <span
                  class="comparison-metric__change"
                  :class="getChangeClass(comparison[key]?.change?.[metric])"
                >
                  {{ formatChange(comparison[key]?.change?.[metric]) }}
                </span>
              </div>
            </div>
            <el-skeleton v-else :rows="4" animated />
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 播放量榜单 -->
    <el-card shadow="hover" class="analytics__ranking">
      <template #header>
        <div class="ranking-header">
          <span>播放量榜单</span>
          <el-radio-group v-model="rankingPeriod" size="small" @change="loadRanking">
            <el-radio-button value="week">本周</el-radio-button>
            <el-radio-button value="month">本月</el-radio-button>
            <el-radio-button value="all">全部</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <el-table :data="viewsRanking" stripe v-loading="rankingLoading">
        <el-table-column label="排名" width="70" align="center">
          <template #default="{ row }">
            <span class="rank-badge" :class="'rank-' + row.rank" v-if="row.rank <= 3">{{ row.rank }}</span>
            <span v-else>{{ row.rank }}</span>
          </template>
        </el-table-column>
        <el-table-column label="内容" min-width="200">
          <template #default="{ row }">
            <div class="ranking-title">{{ row.title || '无标题' }}</div>
            <div class="ranking-meta">{{ row.accountName }} · <PlatformIcon :platform="row.platform" size="small" /></div>
          </template>
        </el-table-column>
        <el-table-column label="播放量" width="120" align="right" sortable>
          <template #default="{ row }">{{ formatNum(row.views) }}</template>
        </el-table-column>
        <el-table-column label="点赞" width="100" align="right">
          <template #default="{ row }">{{ formatNum(row.likes) }}</template>
        </el-table-column>
        <el-table-column label="评论" width="100" align="right">
          <template #default="{ row }">{{ formatNum(row.comments) }}</template>
        </el-table-column>
        <el-table-column label="分享" width="100" align="right">
          <template #default="{ row }">{{ formatNum(row.shares) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { analyticsApi } from '@/api/analytics'
import { PLATFORM_LABELS, type PlatformStats as PlatformStatsType } from '@/types'
import DataChart from '@/components/common/DataChart.vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'

const days = ref(30)
const platform = ref('')
const platformStats = ref<PlatformStatsType[]>([])
const comparison = ref<any>(null)
const viewsRanking = ref<any[]>([])
const rankingPeriod = ref<'week' | 'month' | 'all'>('week')
const rankingLoading = ref(false)

const comparisonLabels: Record<string, { label: string }> = {
  weekOverWeek: { label: '周环比（本周 vs 上周）' },
  monthOverMonth: { label: '月环比（本月 vs 上月）' },
  yearOverYear: { label: '年同比（本月 vs 去年同月）' },
}

const metricKeys = ['views', 'likes', 'comments', 'followers', 'posts'] as const
const metricLabels: Record<string, string> = {
  views: '播放量',
  likes: '点赞',
  comments: '评论',
  shares: '分享',
  followers: '新增粉丝',
  posts: '发布数',
}

const dateLabels = computed(() =>
  Array.from({ length: days.value }, (_, i) =>
    dayjs().subtract(days.value - 1 - i, 'day').format('MM-DD')
  )
)

// TODO: 图表数据为 mock（随机生成），正式环境需从 analyticsApi 获取真实数据
const followerChart = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['新增粉丝'] },
  grid: { left: 50, right: 20, top: 40, bottom: 30 },
  xAxis: { type: 'category' as const, data: dateLabels.value },
  yAxis: { type: 'value' as const, name: '新增粉丝' },
  series: [
    {
      name: '新增粉丝',
      type: 'line' as const,
      smooth: true,
      areaStyle: { opacity: 0.3 },
      data: Array.from({ length: days.value }, () => Math.floor(Math.random() * 1500 + 500)),
    },
  ],
}))

const engagementChart = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['点赞率', '评论率', '分享率'] },
  grid: { left: 50, right: 20, top: 40, bottom: 30 },
  xAxis: { type: 'category' as const, data: dateLabels.value },
  yAxis: { type: 'value' as const, name: '百分比(%)' },
  series: [
    { name: '点赞率', type: 'line' as const, smooth: true, data: Array.from({ length: days.value }, () => +(Math.random() * 5 + 2).toFixed(1)) },
    { name: '评论率', type: 'line' as const, smooth: true, data: Array.from({ length: days.value }, () => +(Math.random() * 2 + 0.5).toFixed(1)) },
    { name: '分享率', type: 'line' as const, smooth: true, data: Array.from({ length: days.value }, () => +(Math.random() * 1 + 0.2).toFixed(1)) },
  ],
}))

const publishEffectChart = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['播放量', '点赞', '评论', '分享'] },
  grid: { left: 60, right: 20, top: 40, bottom: 30 },
  xAxis: { type: 'category' as const, data: dateLabels.value },
  yAxis: { type: 'value' as const },
  series: [
    { name: '播放量', type: 'bar' as const, data: Array.from({ length: days.value }, () => Math.floor(Math.random() * 50000 + 10000)) },
    { name: '点赞', type: 'bar' as const, data: Array.from({ length: days.value }, () => Math.floor(Math.random() * 5000 + 1000)) },
    { name: '评论', type: 'bar' as const, data: Array.from({ length: days.value }, () => Math.floor(Math.random() * 500 + 100)) },
    { name: '分享', type: 'bar' as const, data: Array.from({ length: days.value }, () => Math.floor(Math.random() * 200 + 50)) },
  ],
}))

const platformCompareChart = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { bottom: 0 },
  radar: {
    indicator: [
      { name: '粉丝', max: 1000000 },
      { name: '点赞', max: 5000000 },
      { name: '发布', max: 500 },
      { name: '互动率', max: 10 },
      { name: '增长', max: 20 },
    ],
  },
  series: [
    {
      type: 'radar' as const,
      data: [
        { value: [800000, 3000000, 300, 6.5, 12], name: '抖音' },
        { value: [400000, 1500000, 200, 4.2, 8], name: '快手' },
        { value: [300000, 800000, 150, 5.8, 15], name: '小红书' },
      ],
    },
  ],
}))

function refreshData() {
  loadStats()
  loadComparison()
  loadRanking()
}

async function loadStats() {
  const res = await analyticsApi.getPlatformStats()
  platformStats.value = res.data
}

async function loadComparison() {
  try {
    const res = await analyticsApi.getComparison()
    comparison.value = res
  } catch { /* silent */ }
}

async function loadRanking() {
  rankingLoading.value = true
  try {
    const res = await analyticsApi.getViewsRanking({ period: rankingPeriod.value, limit: 50 })
    viewsRanking.value = res.data.ranking
  } catch { /* silent */ }
  rankingLoading.value = false
}

function formatNum(num: number | undefined | null): string {
  if (num == null) return '-'
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  return num.toLocaleString()
}

function formatChange(val: number | undefined | null): string {
  if (val == null) return '-'
  const prefix = val > 0 ? '+' : ''
  return `${prefix}${val}%`
}

function getChangeClass(val: number | undefined | null): string {
  if (val == null || val === 0) return ''
  return val > 0 ? 'change--up' : 'change--down'
}

onMounted(() => {
  loadStats()
  loadComparison()
  loadRanking()
})
</script>

<style lang="scss" scoped>
.analytics {
  &__filter {
    margin-bottom: 20px;
  }

  &__charts {
    margin-bottom: 20px;
  }

  &__comparison {
    margin-top: 20px;
  }

  &__ranking {
    margin-top: 20px;
  }
}

.comparison-card {
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: #303133;
    margin-bottom: 12px;
  }
}

.comparison-metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #f5f7fa;

  &:last-child {
    border-bottom: none;
  }

  &__label {
    font-size: 13px;
    color: #606266;
  }

  &__value {
    font-size: 14px;
    font-weight: 500;
    color: #303133;
  }

  &__change {
    font-size: 12px;
    font-weight: 500;
    min-width: 50px;
    text-align: right;
  }
}

.change--up {
  color: #67c23a;
}

.change--down {
  color: #f56c6c;
}

.ranking-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.ranking-title {
  font-size: 14px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-meta {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: bold;
  color: #fff;
}

.rank-1 { background: #f5a623; }
.rank-2 { background: #909399; }
.rank-3 { background: #b87333; }
</style>
