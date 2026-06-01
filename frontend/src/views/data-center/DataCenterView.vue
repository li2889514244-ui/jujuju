<template>
  <div class="data-center">
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
          <el-button type="primary" @click="refreshAll" :loading="loading">查询</el-button>
        </el-form-item>
        <el-form-item>
          <el-tooltip content="伴侣打开后每30分钟自动采集，点查询刷新即可" placement="bottom">
            <el-button @click="refreshAll" :loading="loading" type="success">刷新数据</el-button>
          </el-tooltip>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Overview Cards -->
    <el-row :gutter="20" class="data-center__overview">
      <el-col :xs="12" :sm="8" :md="4" v-for="card in overviewCards" :key="card.label">
        <el-card shadow="hover" class="overview-card">
          <div class="overview-card__label">{{ card.label }}</div>
          <div class="overview-card__value">{{ card.value }}</div>
          <div
            class="overview-card__change"
            :class="card.trend > 0 ? 'trend--up' : card.trend < 0 ? 'trend--down' : ''"
            v-if="card.trend !== null"
          >
            <el-icon :size="12"><CaretTop v-if="card.trend > 0" /><CaretBottom v-else /></el-icon> {{ Math.abs(card.trend) }}%
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
          <el-table :data="viewsRanking" stripe v-loading="rankingLoading" max-height="420" @row-click="handleRowClick">
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

const days = ref(30)
const platform = ref('')
const loading = ref(false)
const collecting = ref(false)

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
            style: { text: '暂无数据', fontSize: 16, fill: '#8a8078' },
          },
        ]
      : undefined,
}))

const trendLabel = computed(() => {
  if (trendMetric.value === 'views') return '播放量'
  if (trendMetric.value === 'engagement') return '互动率(%)'
  return '粉丝增长'
})

// Platform
const platformStats = ref<any[]>([])

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
      res = await analyticsApi.getLikesTrend({ days: d, platform: p })
      // Actually get views trend - use daily stats aggregation from publish effect
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
  try {
    const res = await analyticsApi.getPlatformStats()
    platformStats.value = (res.data || []) as any[]
  } catch {
    platformStats.value = []
  }
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

async function handleCollect() {
  collecting.value = true
  try {
    const res = await analyticsApi.triggerRealDataCollection()
    ElMessage.success(
      res?.status === 'started' ? '数据采集已启动，正在从各平台获取真实数据...' : '采集指令已发送',
    )
    // 等 10 秒后刷新（给伴侣时间去采集）
    setTimeout(() => refreshAll(), 10000)
  } catch (e: any) {
    ElMessage.warning(e.message || '请先启动桌面伴侣，然后重试')
  }
  collecting.value = false
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
  &__filter {
    margin-bottom: 20px;
  }
  &__overview {
    margin-bottom: 20px;
  }
  &__chart {
    margin-bottom: 20px;
  }
  &__body {
  }
}

.overview-card {
  text-align: center;
  &__label {
    font-size: 13px;
    color: $color-text-secondary;
    margin-bottom: 8px;
  }
  &__value {
    font-size: 24px;
    font-weight: 600;
    color: $color-text-primary;
  }
  &__change {
    font-size: $text-caption;
    margin-top: 6px;
    font-weight: 500;
  }
}

.trend--up { color: $color-sage; }
.trend--down { color: $color-rust; }

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.ranking-title {
  font-size: 13px;
  color: $color-text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
}
.ranking-meta {
  font-size: 11px;
  color: $color-text-secondary;
  margin-top: 2px;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: bold;
  color: #fff;
}
.rank-1 { background: $color-gold; }
.rank-2 { background: $color-text-tertiary; }
.rank-3 { background: $color-copper; }
</style>
