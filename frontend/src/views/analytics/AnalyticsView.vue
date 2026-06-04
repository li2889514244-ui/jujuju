<template>
  <div class="analytics">
    <div class="analytics__header">
      <div>
        <span class="section-label">内容分析</span>
        <h2>作品表现与增长复盘</h2>
        <p>聚焦内容发布后的播放、互动、平台对比和爆款排行。</p>
      </div>
      <div class="analytics__links">
        <router-link to="/data-center">矩阵总览</router-link>
        <router-link to="/report">报表导出</router-link>
      </div>
    </div>

    <!-- Loading Skeleton -->
    <template v-if="loadingCharts && platformStats.length === 0 && followerTrend.length === 0">
      <div class="analytics__skeleton">
        <!-- Filter bar skeleton -->
        <el-card shadow="hover" class="analytics__filter">
          <el-skeleton :rows="1" animated style="width: 70%" />
        </el-card>
        <!-- Chart row 1 -->
        <el-row :gutter="20" class="analytics__charts">
          <el-col :xs="24" :lg="12">
            <el-card shadow="hover">
              <template #header><el-skeleton :rows="1" animated style="width: 120px" /></template>
              <el-skeleton :rows="12" animated />
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-card shadow="hover">
              <template #header><el-skeleton :rows="1" animated style="width: 120px" /></template>
              <el-skeleton :rows="12" animated />
            </el-card>
          </el-col>
        </el-row>
        <!-- Chart row 2 -->
        <el-row :gutter="20" class="analytics__charts">
          <el-col :xs="24" :lg="12">
            <el-card shadow="hover">
              <template #header><el-skeleton :rows="1" animated style="width: 120px" /></template>
              <el-skeleton :rows="12" animated />
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="12">
            <el-card shadow="hover">
              <template #header><el-skeleton :rows="1" animated style="width: 120px" /></template>
              <el-skeleton :rows="12" animated />
            </el-card>
          </el-col>
        </el-row>
        <!-- Table skeleton -->
        <el-card shadow="hover">
          <template #header><el-skeleton :rows="1" animated style="width: 120px" /></template>
          <el-skeleton :rows="6" animated />
        </el-card>
      </div>
    </template>

    <!-- Actual content -->
    <template v-else>
      <el-card shadow="hover" class="analytics__filter">
        <el-form :inline="true">
          <el-form-item label="时间范围">
            <el-select v-model="days" style="width: 140px" @change="refreshData">
              <el-option label="近7天" :value="7" />
              <el-option label="近30天" :value="30" />
              <el-option label="近90天" :value="90" />
            </el-select>
          </el-form-item>
          <el-form-item label="平台">
            <el-select
              v-model="platform"
              placeholder="全部平台"
              clearable
              style="width: 140px"
              @change="refreshData"
            >
              <el-option label="全部" value="" />
              <el-option
                v-for="(label, key) in PLATFORM_LABELS"
                :key="key"
                :label="label"
                :value="key"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loadingCharts" @click="refreshData">查询</el-button>
          </el-form-item>
          <el-form-item>
            <el-button :loading="collecting" type="success" @click="handleCollect"
              >手动采集真实数据</el-button
            >
          </el-form-item>
          <el-form-item>
            <el-button @click="handleExport">导出报表</el-button>
          </el-form-item>
        </el-form>
      </el-card>

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

      <el-card shadow="hover">
        <template #header>平台数据明细</template>
        <el-table :data="platformStats" stripe
          ><template #empty><el-empty description="暂无平台数据，请先添加账号" /></template>
          <el-table-column label="平台" width="100">
            <template #default="{ row }"
              ><PlatformIcon :platform="row.platform" show-label
            /></template>
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

      <el-card shadow="hover" class="analytics__comparison">
        <template #header>数据对比（同比/环比）</template>
        <el-row :gutter="20">
          <el-col v-for="(item, key) in comparisonLabels" :key="key" :xs="24" :md="8">
            <div class="comparison-card">
              <div class="comparison-card__title">{{ item.label }}</div>
              <div v-if="comparison" class="comparison-card__metrics">
                <div v-for="metric in metricKeys" :key="metric" class="comparison-metric">
                  <span class="comparison-metric__label">{{ metricLabels[metric] }}</span>
                  <span class="comparison-metric__value">{{
                    formatNum(comparison[key]?.current?.[metric])
                  }}</span>
                  <span
                    class="comparison-metric__change"
                    :class="getChangeClass(comparison[key]?.change?.[metric])"
                  >
                    {{ formatChange(comparison[key]?.change?.[metric]) }}
                  </span>
                </div>
              </div>
            </div>
          </el-col>
        </el-row>
      </el-card>

      <el-card shadow="hover" class="analytics__ranking">
        <template #header>
          <div class="ranking-header">
            <span>播放量排行榜</span>
            <el-radio-group v-model="rankingPeriod" size="small" @change="loadRanking">
              <el-radio-button value="week">周榜</el-radio-button>
              <el-radio-button value="month">月榜</el-radio-button>
              <el-radio-button value="all">总榜</el-radio-button>
            </el-radio-group>
          </div>
        </template>
        <el-table v-loading="rankingLoading" :data="viewsRanking" stripe @row-click="handleRowClick"
          ><template #empty><el-empty description="暂无排行数据" /></template>
          <el-table-column label="排名" width="70">
            <template #default="{ row }">
              <span class="rank-badge" :class="`rank-${Math.min(row.rank, 3)}`">{{
                row.rank
              }}</span>
            </template>
          </el-table-column>
          <el-table-column label="内容" min-width="200">
            <template #default="{ row }">
              <div class="ranking-title">{{ row.title }}</div>
              <div class="ranking-meta">{{ row.accountName }} · {{ row.platform }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="views" label="播放量" width="120">
            <template #default="{ row }">{{ row.views?.toLocaleString() }}</template>
          </el-table-column>
          <el-table-column prop="likes" label="点赞" width="100">
            <template #default="{ row }">{{ row.likes?.toLocaleString() }}</template>
          </el-table-column>
        </el-table>
      </el-card>

      <PostDetailDrawer ref="detailDrawerRef" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import DataChart from '@/components/common/DataChart.vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import PostDetailDrawer from '@/components/common/PostDetailDrawer.vue'
import { analyticsApi } from '@/api/analytics'
import { PLATFORM_LABELS } from '@/types'

const days = ref(7)
const platform = ref('')
const platformStats = ref<any[]>([])
const comparison = ref<any>(null)
const viewsRanking = ref<any[]>([])
const rankingLoading = ref(false)
const rankingPeriod = ref('week')
const collecting = ref(false)

// Real chart data
const followerTrend = ref<number[]>([])
const engagementData = ref<number[]>([])
const publishData = ref<any[]>([])
const loadingCharts = ref(false)

const dates = computed(() =>
  Array.from({ length: days.value }, (_, i) =>
    dayjs()
      .subtract(days.value - 1 - i, 'day')
      .format('MM-DD'),
  ),
)

const followerChart = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['新增粉丝'] },
  grid: { left: 50, right: 20, top: 40, bottom: 30 },
  xAxis: { type: 'category' as const, data: dates.value },
  yAxis: { type: 'value' as const, name: '粉丝' },
  series: [
    {
      name: '新增粉丝',
      type: 'line' as const,
      smooth: true,
      areaStyle: { opacity: 0.3 },
      data: followerTrend.value.length > 0 ? followerTrend.value : [],
    },
  ],
  graphic:
    followerTrend.value.length === 0
      ? [
          {
            type: 'text',
            left: 'center',
            top: 'center',
            style: { text: '暂无数据', fontSize: 16, fill: '#AEAEB2' },
          },
        ]
      : undefined,
}))

const engagementChart = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['互动率'] },
  grid: { left: 50, right: 20, top: 40, bottom: 30 },
  xAxis: { type: 'category' as const, data: dates.value },
  yAxis: { type: 'value' as const, name: '%' },
  series: [
    {
      name: '互动率',
      type: 'line' as const,
      smooth: true,
      data: engagementData.value.length > 0 ? engagementData.value : [],
    },
  ],
  graphic:
    engagementData.value.length === 0
      ? [
          {
            type: 'text',
            left: 'center',
            top: 'center',
            style: { text: '暂无数据', fontSize: 16, fill: '#AEAEB2' },
          },
        ]
      : undefined,
}))

const publishEffectChart = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['播放量', '点赞', '评论', '分享'] },
  grid: { left: 50, right: 20, top: 40, bottom: 30 },
  xAxis: { type: 'category' as const, data: dates.value },
  yAxis: { type: 'value' as const },
  graphic:
    publishData.value.length === 0
      ? [
          {
            type: 'text',
            left: 'center',
            top: 'center',
            style: { text: '暂无数据', fontSize: 16, fill: '#AEAEB2' },
          },
        ]
      : undefined,
  series:
    publishData.value.length > 0
      ? [
          {
            name: '播放量',
            type: 'bar' as const,
            data: publishData.value.map((d: any) => d.views || 0),
          },
          {
            name: '点赞',
            type: 'bar' as const,
            data: publishData.value.map((d: any) => d.likes || 0),
          },
          {
            name: '评论',
            type: 'bar' as const,
            data: publishData.value.map((d: any) => d.comments || 0),
          },
          {
            name: '分享',
            type: 'bar' as const,
            data: publishData.value.map((d: any) => d.shares || 0),
          },
        ]
      : [],
}))

const platformCompareChart = computed(() => {
  const stats = platformStats.value || []
  if (!stats.length) return { title: { text: '暂无数据', left: 'center', top: 'center' } }
  const maxF = Math.max(...stats.map((s: any) => s.followers || 0), 1)
  const maxL = Math.max(...stats.map((s: any) => s.likes || 0), 1)
  return {
    tooltip: { trigger: 'axis' as const },
    legend: { bottom: 0 },
    radar: {
      indicator: [
        { name: '粉丝', max: maxF },
        { name: '点赞', max: maxL },
        { name: '发布', max: Math.max(...stats.map((s: any) => s.publishes || 0), 1) },
        { name: '互动率', max: Math.max(...stats.map((s: any) => s.engagementRate || 0), 1) },
        { name: '增长', max: 20 },
      ],
    },
    series: [
      {
        type: 'radar' as const,
        data: stats.map((s: any) => ({
          value: [s.followers || 0, s.likes || 0, s.publishes || 0, s.engagementRate || 0, 10],
          name: (PLATFORM_LABELS as any)[s.platform] || s.platform,
        })),
      },
    ],
  }
})

const comparisonLabels: Record<string, { label: string }> = {
  weekOverWeek: { label: '周环比' },
  monthOverMonth: { label: '月环比' },
  yearOverYear: { label: '年同比' },
}
const metricKeys = ['followers', 'likes', 'comments', 'shares', 'views']
const metricLabels: Record<string, string> = {
  followers: '粉丝',
  likes: '点赞',
  comments: '评论',
  shares: '分享',
  views: '播放',
}

async function loadChartData() {
  loadingCharts.value = true
  const p = platform.value || undefined
  const d = days.value
  try {
    const [ft, eg, pe] = await Promise.all([
      analyticsApi.getFollowerTrend({ days: d, platform: p }),
      analyticsApi.getEngagementRate({ days: d, platform: p }),
      analyticsApi.getPublishEffect({ days: d }),
    ])
    followerTrend.value = (ft.data || []).map((x: any) => x.value || 0)
    engagementData.value = (eg.data || []).map((x: any) => x.value || 0)
    publishData.value = pe.data || []
  } catch {
    /* keep empty charts if API fails */
  }
  loadingCharts.value = false
}

function refreshData() {
  loadStats()
  loadComparison()
  loadRanking()
  loadChartData()
}

async function loadStats() {
  const res = await analyticsApi.getPlatformStats()
  platformStats.value = res.data || []
}

async function loadComparison() {
  try {
    comparison.value = await analyticsApi.getComparison()
  } catch {
    /* silent */
  }
}

async function loadRanking() {
  rankingLoading.value = true
  try {
    const r = await analyticsApi.getViewsRanking({ period: rankingPeriod.value as any, limit: 50 })
    viewsRanking.value = r.data?.ranking || []
  } catch {
    /* noop */
  }
  rankingLoading.value = false
}

const detailDrawerRef = ref()

function handleRowClick(row: any) {
  detailDrawerRef.value?.open(row)
}

function formatNum(n: any): string {
  if (n == null) return '-'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}
function formatChange(v: any): string {
  if (v == null) return '-'
  return `${v > 0 ? '+' : ''}${v}%`
}
function getChangeClass(v: any): string {
  if (v == null || v === 0) return ''
  return v > 0 ? 'change--up' : 'change--down'
}

async function handleCollect() {
  collecting.value = true
  try {
    const res = await analyticsApi.triggerRealDataCollection()
    ElMessage.success(
      res?.status === 'started' ? '数据采集已启动，正在从各平台获取真实数据...' : '采集指令已发送',
    )
    setTimeout(() => refreshData(), 10000)
  } catch (e: any) {
    ElMessage.warning(e.message || '请先启动桌面伴侣，然后重试')
  }
  collecting.value = false
}

function handleExport() {
  const startDate = dayjs().subtract(days.value, 'day').format('YYYY-MM-DD')
  const endDate = dayjs().format('YYYY-MM-DD')
  analyticsApi
    .exportReport({ startDate, endDate, format: 'csv' })
    .then((res: any) => {
      const blob = new Blob(['﻿' + (typeof res === 'string' ? res : JSON.stringify(res))], {
        type: 'text/csv;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `数据报表_${startDate}_${endDate}.csv`
      a.click()
      URL.revokeObjectURL(url)
      ElMessage.success('导出成功')
    })
    .catch(() => ElMessage.error('导出失败'))
}

onMounted(() => {
  loadStats()
  loadComparison()
  loadRanking()
  loadChartData()
})
</script>

<style lang="scss" scoped>
.analytics {
  &__header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: $space-lg;
    margin-bottom: $space-lg;

    h2 {
      margin: 4px 0 6px;
      font-size: $text-headline;
      letter-spacing: 0;
    }

    p {
      color: $color-text-secondary;
      margin: 0;
    }
  }

  &__links {
    display: flex;
    flex-wrap: wrap;
    gap: $space-xs;

    a {
      padding: 6px 10px;
      border: 1px solid $color-border;
      border-radius: $radius-sm;
      background: $color-bg-tertiary;
      color: $color-text-secondary;
      font-size: $text-caption;

      &:hover {
        color: $color-accent;
        border-color: $color-border-hover;
      }
    }
  }

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

  &__skeleton {
    // Skeleton mimics the real layout for smooth transition
    .analytics__filter,
    .analytics__charts {
      opacity: 0.7;
    }
  }
}
.comparison-card {
  @include card;
  padding: $space-sm $space-md;
  &__title {
    font-size: $text-body;
    font-weight: 600;
    color: $color-text-primary;
    margin-bottom: $space-sm;
  }
}
.comparison-metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid $color-border;
  &:last-child {
    border-bottom: none;
  }
  &__label {
    font-size: 13px;
    color: $color-text-tertiary;
  }
  &__value {
    font-size: $text-body;
    font-weight: 500;
    color: $color-text-primary;
  }
  &__change {
    font-size: $text-caption;
    font-weight: 500;
    min-width: 50px;
    text-align: right;
  }
}
.change--up {
  color: $color-success;
}
.change--down {
  color: $color-danger;
}
.ranking-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
.ranking-title {
  font-size: $text-body;
  color: $color-text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ranking-meta {
  font-size: $text-caption;
  color: $color-text-secondary;
  margin-top: 2px;
}
.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: $text-caption;
  font-weight: bold;
  color: #fff;
}
.rank-1 {
  background: $color-warning;
}
.rank-2 {
  background: $color-text-secondary;
}
.rank-3 {
  background: $color-accent-alt;
}

@media (max-width: 768px) {
  .analytics__header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
