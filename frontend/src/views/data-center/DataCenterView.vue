<template>
  <div class="data-center">
    <div class="data-center__header">
      <div>
        <span class="section-label">矩阵数据</span>
        <h2>账号矩阵总览</h2>
        <p>看全局表现、涨粉趋势、平台分布和内容排行榜。</p>
      </div>
      <div class="data-center__links">
        <router-link to="/analytics">内容分析</router-link>
        <router-link to="/monetization">微信小店销售</router-link>
      </div>
    </div>

    <!-- Filter -->
    <el-card shadow="hover" class="data-center__filter">
      <el-form :inline="true">
        <el-form-item label="时间范围">
          <el-select v-model="days" style="width: 140px" @change="refreshAll">
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
            @change="refreshAll"
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
          <el-button type="primary" :loading="loading" @click="refreshAll">查询</el-button>
        </el-form-item>
        <el-form-item>
          <el-tooltip content="伴侣打开后每30分钟自动采集，点查询刷新即可" placement="bottom">
            <el-button :loading="loading" type="success" @click="refreshAll">刷新数据</el-button>
          </el-tooltip>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Overview Cards -->
    <el-row :gutter="20" class="data-center__overview">
      <el-col v-for="card in overviewCards" :key="card.label" :xs="12" :sm="8" :md="4">
        <el-card shadow="hover" class="overview-card">
          <div class="overview-card__label">{{ card.label }}</div>
          <div class="overview-card__value">{{ card.value }}</div>
          <div
            v-if="card.trend !== null"
            class="overview-card__change"
            :class="card.trend > 0 ? 'trend--up' : card.trend < 0 ? 'trend--down' : ''"
          >
            <el-icon :size="12"><CaretTop v-if="card.trend > 0" /><CaretBottom v-else /></el-icon>
            {{ Math.abs(card.trend) }}%
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Trend Chart -->
    <el-card shadow="hover" class="data-center__chart">
      <template #header>
        <div class="chart-header">
          <span>数据趋势</span>
          <el-radio-group v-model="trendMetric" size="small" @change="loadTrend">
            <el-radio-button value="views">播放量</el-radio-button>
            <el-radio-button value="engagement">互动率</el-radio-button>
            <el-radio-button value="followers">粉丝增长</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <DataChart :option="trendChartOption" :height="380" />
    </el-card>

    <!-- Platform + Ranking -->
    <el-row :gutter="20" class="data-center__body">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>平台数据明细</template>
          <el-table :data="platformStats" stripe>
            <template #empty
              ><el-empty description="暂无平台数据，请先添加账号并采集数据"
            /></template>
            <el-table-column label="平台" width="90">
              <template #default="{ row }">
                <PlatformIcon :platform="row.platform" show-label />
              </template>
            </el-table-column>
            <el-table-column prop="accountCount" label="账号" width="60" />
            <el-table-column prop="views" label="播放量" width="100">
              <template #default="{ row }">{{ formatNum(row.views) }}</template>
            </el-table-column>
            <el-table-column prop="likes" label="点赞" width="80">
              <template #default="{ row }">{{ formatNum(row.likes) }}</template>
            </el-table-column>
            <el-table-column prop="comments" label="评论" width="80">
              <template #default="{ row }">{{ formatNum(row.comments) }}</template>
            </el-table-column>
            <el-table-column prop="shares" label="分享" width="80">
              <template #default="{ row }">{{ formatNum(row.shares) }}</template>
            </el-table-column>
            <el-table-column prop="saves" label="收藏" width="80">
              <template #default="{ row }">{{ formatNum(row.saves) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <div class="chart-header">
              <span>播放量排行榜</span>
              <el-radio-group v-model="rankingPeriod" size="small" @change="loadRanking">
                <el-radio-button value="week">周榜</el-radio-button>
                <el-radio-button value="month">月榜</el-radio-button>
                <el-radio-button value="all">总榜</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <el-table
            v-loading="rankingLoading"
            :data="viewsRanking"
            stripe
            max-height="420"
            @row-click="handleRowClick"
          >
            <template #empty><el-empty description="暂无排行数据" /></template>
            <el-table-column label="#" width="50">
              <template #default="{ row }">
                <span class="rank-badge" :class="`rank-${Math.min(row.rank, 3)}`">{{
                  row.rank
                }}</span>
              </template>
            </el-table-column>
            <el-table-column label="内容" min-width="160">
              <template #default="{ row }">
                <div class="ranking-title">{{ row.title }}</div>
                <div class="ranking-meta">{{ row.accountName }} · {{ row.platform }}</div>
              </template>
            </el-table-column>
            <el-table-column label="播放量" width="90">
              <template #default="{ row }">{{ formatNum(row.views) }}</template>
            </el-table-column>
            <el-table-column label="点赞" width="70">
              <template #default="{ row }">{{ formatNum(row.likes) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <PostDetailDrawer ref="detailDrawerRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { CaretTop, CaretBottom } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import DataChart from '@/components/common/DataChart.vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import PostDetailDrawer from '@/components/common/PostDetailDrawer.vue'
import { analyticsApi } from '@/api/analytics'
import { PLATFORM_LABELS } from '@/types'
import { useDataTable } from '@/composables/useDataTable'

const days = ref(30)
const platform = ref('')
const loading = ref(false)
// Overview
const overview = ref<any>(null)
const overviewCards = computed(() => {
  const ov = overview.value
  if (!ov) return []
  const cards = [
    {
      label: '总播放量',
      value: formatNum(ov.engagement?.totalViews || 0),
      trend: null as number | null,
    },
    { label: '总点赞', value: formatNum(ov.engagement?.totalLikes || 0), trend: null },
    { label: '总评论', value: formatNum(ov.engagement?.totalComments || 0), trend: null },
    { label: '总分享', value: formatNum(ov.engagement?.totalShares || 0), trend: null },
    { label: '总粉丝', value: formatNum(ov.accounts?.totalFollowers || 0), trend: null },
    { label: '账号数', value: `${ov.accounts?.total || 0}`, trend: null },
  ]
  // Add trend from comparison data if available
  if (comparisonData.value?.weekOverWeek) {
    const ch = comparisonData.value.weekOverWeek.change || {}
    cards[0].trend = ch.views ?? null
    cards[1].trend = ch.likes ?? null
    cards[2].trend = ch.comments ?? null
    cards[3].trend = ch.shares ?? null
    cards[4].trend = ch.followers ?? null
  }
  return cards
})

// Trend
const trendMetric = ref('views')
const trendData = ref<any[]>([])
const dates = computed(() =>
  Array.from({ length: days.value }, (_, i) =>
    dayjs()
      .subtract(days.value - 1 - i, 'day')
      .format('MM-DD'),
  ),
)

const trendChartOption = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: [trendLabel.value] },
  grid: { left: 60, right: 20, top: 40, bottom: 30 },
  xAxis: { type: 'category' as const, data: dates.value },
  yAxis: { type: 'value' as const },
  series: [
    {
      name: trendLabel.value,
      type: 'line' as const,
      smooth: true,
      areaStyle: { opacity: 0.2 },
      data: trendData.value,
    },
  ],
  graphic:
    trendData.value.length === 0
      ? [
          {
            type: 'text',
            left: 'center',
            top: 'center',
            style: { text: '暂无数据', fontSize: 16, fill: '#6b7390' },
          },
        ]
      : undefined,
}))

const trendLabel = computed(() => {
  if (trendMetric.value === 'views') return '播放量'
  if (trendMetric.value === 'engagement') return '互动率(%)'
  return '粉丝增长'
})

// Platform stats — now uses shared useDataTable composable
const { data: platformStats, refresh: refreshPlatformStats } = useDataTable<any>(async () => {
  const res = await analyticsApi.getPlatformStats()
  return (res.data || []) as any[]
})

// Ranking
const viewsRanking = ref<any[]>([])
const rankingLoading = ref(false)
const rankingPeriod = ref('week')

// Comparison
const comparisonData = ref<any>(null)

const detailDrawerRef = ref()

function handleRowClick(row: any) {
  detailDrawerRef.value?.open(row)
}

function formatNum(n: any): string {
  if (n == null || n === 0) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return Number(n).toLocaleString()
}

async function loadOverview() {
  try {
    const res = await analyticsApi.getOverview()
    overview.value = res.data
  } catch {
    ElMessage.error('数据加载失败')
  }
}

async function loadTrend() {
  try {
    const p = platform.value || undefined
    const d = days.value
    let res
    if (trendMetric.value === 'views') {
      // Use daily stats aggregation from publish effect
      res = await analyticsApi.getPublishEffect({ days: d })
      const byDate: Record<string, number> = {}
      for (const item of res.data || []) {
        const date = item.date?.slice(0, 10) || dayjs(item.publishedAt).format('YYYY-MM-DD')
        byDate[date] = (byDate[date] || 0) + (item.views || 0)
      }
      const sorted = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
      trendData.value = sorted.map(([, v]) => v)
    } else if (trendMetric.value === 'engagement') {
      res = await analyticsApi.getEngagementRate({ days: d, platform: p })
      trendData.value = (res.data || []).map((x: any) => x.value || 0)
    } else {
      res = await analyticsApi.getFollowerTrend({ days: d, platform: p })
      trendData.value = (res.data || []).map((x: any) => x.value || 0)
    }
  } catch {
    trendData.value = []
  }
}

async function loadPlatformStats() {
  await refreshPlatformStats()
}

async function loadRanking() {
  rankingLoading.value = true
  try {
    const r = await analyticsApi.getViewsRanking({
      period: rankingPeriod.value as any,
      limit: 20,
      platform: platform.value || undefined,
    })
    viewsRanking.value = r.data?.ranking || []
  } catch {
    viewsRanking.value = []
  }
  rankingLoading.value = false
}

async function loadComparison() {
  try {
    const res = await analyticsApi.getComparison()
    comparisonData.value = res.data
  } catch {
    comparisonData.value = null
  }
}

async function refreshAll() {
  loading.value = true
  await Promise.all([
    loadOverview(),
    loadTrend(),
    loadPlatformStats(),
    loadRanking(),
    loadComparison(),
  ])
  loading.value = false
}

onMounted(() => {
  loadOverview()
  loadTrend()
  loadPlatformStats()
  loadRanking()
  loadComparison()
})
</script>

<style lang="scss" scoped>
.data-center {
  display: flex;
  flex-direction: column;
  gap: $space-5;

  &__header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: $space-5;
    padding: $space-8;
    border: 1px solid $border-base;
    border-radius: $radius-xl;
    background:
      radial-gradient(circle at 12% 12%, rgba($accent-500, 0.14), transparent 40%), $bg-elevated;
    box-shadow: $shadow-sm;

    h2 {
      margin: $space-3 0;
      font-size: $text-h1;
      letter-spacing: -0.025em;
      font-weight: 600;
      color: $text-primary;
    }

    p {
      color: $text-secondary;
      margin: 0;
      font-size: $text-body;
      line-height: 1.6;
    }
  }

  &__links {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;

    a {
      padding: 9px 14px;
      border: 1px solid $border-strong;
      border-radius: $radius-full;
      background: rgba($accent-500, 0.08);
      color: $accent-400;
      font-size: $text-xs;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s $ease-out;

      &:hover {
        color: $bg-deep;
        background: $accent-500;
        border-color: $accent-500;
      }
    }
  }

  &__filter,
  &__overview,
  &__chart {
    border-radius: $radius-lg;
  }
}

.overview-card {
  text-align: left;
  background: $bg-elevated;
  border: 1px solid $border-base;
  border-radius: $radius-lg;
  padding: $space-4;
  transition:
    border-color 0.2s $ease-out,
    transform 0.2s $ease-out;

  &:hover {
    border-color: $border-strong;
    transform: translateY(-1px);
  }

  :deep(.el-card__body) {
    padding: 0;
  }

  &__label {
    font-size: $text-xs;
    color: $text-tertiary;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
    margin-bottom: $space-2;
  }
  &__value {
    font-size: 26px;
    font-weight: 600;
    color: $text-primary;
    font-family: $font-mono;
    font-feature-settings: 'tnum' 1;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  &__change {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: $text-xs;
    margin-top: $space-2;
    font-weight: 600;
    font-family: $font-mono;
    padding: 2px 8px;
    border-radius: $radius-full;
    background: rgba($color-success, 0.12);
  }
}

.trend--up {
  color: $color-success;
  background: rgba($color-success, 0.12);
}
.trend--down {
  color: $color-danger;
  background: rgba($color-danger, 0.12);
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.ranking-title {
  font-size: $text-body;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
  font-weight: 500;
}
.ranking-meta {
  font-size: $text-xs;
  color: $text-tertiary;
  margin-top: 2px;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: $radius-full;
  font-size: $text-xs;
  font-weight: 600;
  font-family: $font-mono;
  color: $bg-deep;
  background: $border-strong;
}
.rank-1 {
  background: $color-warning;
  color: $bg-deep;
}
.rank-2 {
  background: $text-tertiary;
  color: $text-primary;
}
.rank-3 {
  background: $accent-500;
  color: #fff;
}

@media (max-width: 768px) {
  .data-center__header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
