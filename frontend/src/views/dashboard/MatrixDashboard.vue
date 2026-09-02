<template>
  <div class="matrix-dashboard">
    <!-- Header + Filters -->
    <div class="md-header">
      <div class="md-header__left">
        <h2>矩阵数据</h2>
        <p class="md-header__sub">全平台账号数据实时监控</p>
      </div>
      <div class="md-header__right">
        <el-select
          v-model="groupId"
          class="filter-select group-select"
          clearable
          placeholder="全部老师"
          @change="refreshAll"
        >
          <el-option
            v-for="g in groups"
            :key="g.id"
            :value="g.id"
            :label="g.name + ' (' + g._count.accounts + '账号)'"
          />
        </el-select>
        <el-select
          v-model="platform"
          class="filter-select"
          clearable
          placeholder="全部平台"
          @change="refreshAll"
        >
          <el-option v-for="p in platforms" :key="p.value" :value="p.value" :label="p.label" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="refreshAll">刷新</el-button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && !overview" class="md-skeleton">
      <el-skeleton :rows="3" animated />
    </div>

    <!-- Empty State -->
    <el-empty
      v-else-if="!loading && !overview && !error"
      class="md-empty"
      :image-size="120"
      description="暂无数据，请确保伴侣正在运行，或添加账号后等待数据采集"
    />

    <template v-else>
      <!-- Error State -->
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        closable
        class="md-error"
        @close="error = null"
      />

      <!-- Active Issue Alerts -->
      <div v-if="healthAlerts.length > 0" class="md-alerts">
        <el-alert
          v-for="alert in healthAlerts"
          :key="alert.key"
          :title="alert.title"
          :description="alert.description"
          :type="alert.type"
          show-icon
          :closable="false"
          class="md-alert"
        />
      </div>

      <!-- KPI Cards -->
      <div class="md-kpis">
        <div
          v-for="card in kpiCards"
          :key="card.key"
          class="md-kpi-card md-clickable"
          role="button"
          tabindex="0"
          @click="openKpiDrilldown(card)"
          @keydown.enter.prevent="openKpiDrilldown(card)"
          @keydown.space.prevent="openKpiDrilldown(card)"
        >
          <div class="md-kpi-card__label">{{ card.label }}</div>
          <div class="md-kpi-card__value">{{ card.formatted }}</div>
          <div
            v-if="card.trend !== null"
            class="md-kpi-card__trend"
            :class="card.trend >= 0 ? 'is-up' : 'is-down'"
          >
            <el-icon><CaretTop v-if="card.trend >= 0" /><CaretBottom v-else /></el-icon>
            {{ Math.abs(card.trend) }}%
            <span class="md-kpi-card__trend-label">{{ card.trendLabel }}</span>
          </div>
          <div v-else class="md-kpi-card__trend is-none">—</div>
        </div>
      </div>

      <!-- 日/周/月 聚合统计 -->
      <el-card shadow="hover" class="md-section">
        <div class="md-section__header">
          <span>数据总览</span>
          <el-tooltip
            effect="light"
            content="顶部汇总仅统计当前周期的完整与部分数据账号；历史参考数据不参与汇总"
            placement="bottom"
          >
            <span v-if="periodCompletenessLabel" class="md-period-summary">{{
              periodCompletenessLabel
            }}</span>
          </el-tooltip>
          <el-radio-group v-model="dateType" size="small">
            <el-radio-button value="day">日</el-radio-button>
            <el-radio-button value="week">周</el-radio-button>
            <el-radio-button value="month">月</el-radio-button>
          </el-radio-group>
        </div>
        <el-tooltip effect="light" content="日:昨日，周:最近7天，月:最近30天" placement="bottom">
          <span class="md-date-hint">{{ dateTypeLabel }}数据</span>
        </el-tooltip>
        <div class="md-stats-bar">
          <div
            v-for="stat in aggregatedStats"
            :key="stat.id"
            class="md-stat-item md-clickable"
            role="button"
            tabindex="0"
            @click="openStatDrilldown(stat)"
            @keydown.enter.prevent="openStatDrilldown(stat)"
            @keydown.space.prevent="openStatDrilldown(stat)"
          >
            <div class="md-stat-item__label">{{ stat.text }}</div>
            <div class="md-stat-item__value">
              <AnimatedNumber :value="stat.value" :format="formatNum" :duration="280" />
            </div>
            <div
              v-if="
                aggregatedTrends[stat.type] !== undefined && aggregatedTrends[stat.type] !== null
              "
              class="md-stat-item__trend"
              :class="(aggregatedTrends[stat.type] ?? 0) >= 0 ? 'is-up' : 'is-down'"
            >
              <el-icon
                ><CaretTop v-if="(aggregatedTrends[stat.type] ?? 0) >= 0" /><CaretBottom v-else
              /></el-icon>
              {{ Math.abs(aggregatedTrends[stat.type] ?? 0) }}%
              <span class="md-stat-item__trend-label">环比</span>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 多账号明细 -->
      <el-card shadow="hover" class="md-section">
        <template #header>
          <div class="md-section__header">
            <span>多账号明细</span>
            <span class="md-table-subtitle"
              >展示{{ dateTypeLabel }}周期数据，当前粉丝为最新快照，登录态仅代表伴侣检测结果</span
            >
          </div>
        </template>
        <el-table
          class="md-account-table"
          :data="accountTableData"
          stripe
          size="small"
          max-height="520"
          empty-text="暂无账号数据"
          :row-class-name="({ row }: any) => (row.isStale ? 'row-stale' : '')"
          @sort-change="(sort: any) => toggleSort(sort?.prop || '', sort?.order)"
          @row-click="openAccountDetail"
        >
          <el-table-column type="index" width="50" label="#" align="center" />
          <el-table-column prop="avatar" label="头像" width="60" align="center">
            <template #default="{ row }">
              <el-avatar :size="32" :src="row.avatar">
                <span
                  :style="{
                    width: '32px',
                    height: '32px',
                    lineHeight: '32px',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#fff',
                    background: avatarColor(row.nickname),
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }"
                  >{{ (row.nickname || '?').charAt(0) }}</span
                >
              </el-avatar>
            </template>
          </el-table-column>
          <el-table-column prop="platform" label="平台" width="96" align="center">
            <template #default="{ row }">
              <PlatformBadge :platform="row.platform" size="sm" />
            </template>
          </el-table-column>
          <el-table-column label="登录态" width="82" align="center">
            <template #default="{ row }">
              <span
                class="online-light"
                :class="'online-light--' + accountOnlineState(row)"
                :title="row.onlineReason || accountOnlineLabel(row)"
              >
                <i class="online-light__dot" />
                {{ accountOnlineLabel(row) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="collectLabel" label="最新采集" width="112" align="center">
            <template #default="{ row }">
              <el-tooltip :content="row.collectTitle" placement="top">
                <el-tag
                  size="small"
                  :type="row.collectType"
                  effect="plain"
                  class="collection-tag"
                >
                  {{ row.collectLabel }}
                </el-tag>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column prop="nickname" label="账号名称" min-width="120">
            <template #default="{ row }">
              <div class="cell-nickname">
                <el-button text type="primary" class="account-link" @click.stop="openAccountDetail(row)">
                  {{ row.nickname }}
                </el-button>
              </div>
            </template>
          </el-table-column>
          <el-table-column
            prop="fansFormatted"
            label="当前粉丝"
            width="100"
            align="right"
            sortable="custom"
          />
          <el-table-column
            prop="playFormatted"
            label="播放量"
            width="100"
            align="right"
            sortable="custom"
          >
            <template #default="{ row }">
              <span :class="{ 'stale-value': row.isStale }">{{ row.playFormatted }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="newFansFormatted"
            label="净增粉丝"
            width="100"
            align="right"
            sortable="custom"
          >
            <template #default="{ row }">
              <span :class="{ 'stale-value': row.isStale }">{{ row.newFansFormatted }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="likeFormatted"
            label="点赞"
            width="80"
            align="right"
            sortable="custom"
          >
            <template #default="{ row }">
              <span :class="{ 'stale-value': row.isStale }">{{ row.likeFormatted }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="commentFormatted"
            label="评论"
            width="80"
            align="right"
            sortable="custom"
          >
            <template #default="{ row }">
              <span :class="{ 'stale-value': row.isStale }">{{ row.commentFormatted }}</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="shareFormatted"
            label="分享"
            width="80"
            align="right"
            sortable="custom"
          >
            <template #default="{ row }">
              <span :class="{ 'stale-value': row.isStale }">{{ row.shareFormatted }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- Trend Chart -->
      <el-card shadow="hover" class="md-section">
        <template #header>
          <div class="md-section__header">
            <span>数据趋势</span>
            <el-radio-group v-model="trendMetric" size="small" @change="refreshAll">
              <el-radio-button value="followers">粉丝增长</el-radio-button>
              <el-radio-button value="views">播放量</el-radio-button>
              <el-radio-button value="engagement">互动率</el-radio-button>
            </el-radio-group>
          </div>
        </template>
        <DataChart v-if="trendChartData.length > 0" :option="trendChartOption" :height="320" />
        <div v-else class="md-chart-empty">暂无趋势数据，请确保伴侣持续采集</div>
      </el-card>

      <!-- Platform Comparison + Table -->
      <div class="md-platform-row">
        <el-card shadow="hover" class="md-platform-chart">
          <template #header><span>跨平台对比</span></template>
          <DataChart v-if="platformStats.length > 0" :option="platformChartOption" :height="300" />
          <div v-else class="md-chart-empty">暂无平台数据</div>
        </el-card>
        <el-card shadow="hover" class="md-platform-table">
          <template #header><span>平台数据明细</span></template>
          <el-table
            :data="platformTableData"
            stripe
            size="small"
            max-height="300"
            empty-text="暂无平台数据"
          >
            <el-table-column prop="platform" label="平台" width="80">
              <template #default="{ row }"
                ><PlatformIcon :platform="row.platform" show-label
              /></template>
            </el-table-column>
            <el-table-column prop="accounts" label="账号" width="60" align="right" />
            <el-table-column prop="followers" label="粉丝" align="right" sortable>
              <template #default="{ row }">{{ row.followersFormatted }}</template>
            </el-table-column>
            <el-table-column prop="views" label="播放量" align="right" sortable>
              <template #default="{ row }">{{ row.viewsFormatted }}</template>
            </el-table-column>
            <el-table-column prop="likesFormatted" label="互动" align="right" />
            <el-table-column prop="engagementRate" label="互动率" width="80" align="right">
              <template #default="{ row }">{{ row.engagementRate }}%</template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>
    </template>

    <el-drawer v-model="drilldownVisible" :title="drilldownTitle" size="520px" class="md-drilldown">
      <div class="md-drilldown__section-title">
        参与汇总 · {{ drilldownActiveRows.length }} 个账号
      </div>
      <el-table
        :data="drilldownActiveRows"
        stripe
        size="small"
        max-height="620"
        empty-text="当前周期暂无参与汇总的账号"
        @row-click="openAccountDetail"
      >
        <el-table-column label="账号" min-width="190">
          <template #default="{ row }">
            <div class="drilldown-account">
              <el-avatar :size="30" :src="row.avatar">
                {{ (row.nickname || '?').charAt(0) }}
              </el-avatar>
              <div class="drilldown-account__meta">
                <el-button text type="primary" class="account-link" @click.stop="openAccountDetail(row)">
                  {{ row.nickname }}
                </el-button>
                <PlatformIcon :platform="row.platform" show-label />
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="valueFormatted" label="数值" width="120" align="right" />
        <el-table-column prop="collectLabel" label="最新采集" width="120" align="right">
          <template #default="{ row }">
            <el-tag size="small" :type="row.collectType" effect="plain">
              {{ row.collectLabel }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="syncLabel" label="同步状态" width="120" align="right">
          <template #default="{ row }">
            <el-tag size="small" :type="row.syncType" effect="plain">
              {{ row.syncLabel }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <el-collapse v-if="drilldownHistoricalRows.length > 0" class="md-drilldown__history">
        <el-collapse-item>
          <template #title>
            <span class="md-drilldown__history-title">
              历史参考账号（{{ drilldownHistoricalRows.length }}）
              <em>不参与当前{{ dateTypeLabel }}汇总</em>
            </span>
          </template>
          <el-table
            :data="drilldownHistoricalRows"
            size="small"
            max-height="420"
            empty-text="暂无历史参考账号"
            @row-click="openAccountDetail"
          >
            <el-table-column label="账号" min-width="180">
              <template #default="{ row }">
                <div class="drilldown-account drilldown-account--historical">
                  <el-avatar :size="30" :src="row.avatar">
                    {{ (row.nickname || '?').charAt(0) }}
                  </el-avatar>
                  <div class="drilldown-account__meta">
                    <el-button text type="primary" class="account-link" @click.stop="openAccountDetail(row)">
                      {{ row.nickname }}
                    </el-button>
                    <PlatformIcon :platform="row.platform" show-label />
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="valueFormatted" label="数值" width="100" align="right" />
            <el-table-column prop="dataStatusLabel" label="状态" min-width="140" align="right">
              <template #default="{ row }">
                <el-tag size="small" type="info" effect="plain">{{ row.dataStatusLabel }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-collapse-item>
      </el-collapse>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMatrixDashboard } from '@/composables/useMatrixDashboard'
import { useChartTheme } from '@/composables/useChartTheme'
import DataChart from '@/components/common/DataChart.vue'
import AnimatedNumber from '@/components/common/AnimatedNumber.vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import PlatformBadge from '@/components/common/PlatformBadge.vue'
import { CaretTop, CaretBottom } from '@element-plus/icons-vue'
import { PLATFORM_LABELS } from '@/types'
import { accountOnlineLabel, accountOnlineState } from '@/utils/format'
import type { EChartsOption } from 'echarts'

const { accent, info, mergeOption } = useChartTheme()
const router = useRouter()

const {
  loading,
  error,
  dateType,
  dateTypeLabel,
  platform,
  groupId,
  groups,
  trendMetric,
  overview,
  kpiCards,
  aggregatedStats,
  periodCompletenessLabel,
  aggregatedTrends,
  platformStats,
  platformTableData,
  platformChartData,
  trendChartData,
  accountTableData,
  healthAlerts,
  toggleSort,
  refreshAll,
} = useMatrixDashboard()

const platforms = Object.entries(PLATFORM_LABELS).map(([value, label]) => ({ value, label }))

type DrilldownMetric = 'fans' | 'play' | 'new_fans' | 'like' | 'comment' | 'share' | 'interactions' | 'accounts'

const drilldownVisible = ref(false)
const drilldownMetric = ref<DrilldownMetric>('fans')
const drilldownTitle = ref('')

const drilldownActiveRows = computed(() => {
  return accountTableData.value
    .filter((row: any) => row.periodState === 'complete' || row.periodState === 'partial')
    .map((row: any) => {
      const rawValue = getRowMetricValue(row, drilldownMetric.value)
      return {
        ...row,
        value: rawValue,
        valueFormatted: rawValue === null ? '-' : formatNum(rawValue),
      }
    })
    .filter((row: any) => row.value !== null)
    .sort((a: any, b: any) => b.value - a.value)
})

const drilldownHistoricalRows = computed(() => {
  return accountTableData.value
    .filter((row: any) => row.periodState === 'historical')
    .map((row: any) => {
      const rawValue = getRowMetricValue(row, drilldownMetric.value)
      return {
        ...row,
        value: rawValue,
        valueFormatted: rawValue === null ? '-' : formatNum(rawValue),
      }
    })
    .filter((row: any) => row.value !== null)
    .sort((a: any, b: any) => b.value - a.value)
})

function getRowMetricValue(row: any, metric: DrilldownMetric): number | null {
  if (metric === 'interactions') {
    if (row.like === null && row.comment === null && row.share === null) return null
    return (row.like || 0) + (row.comment || 0) + (row.share || 0)
  }
  if (metric === 'accounts') return 1
  return row[metric] ?? null
}

function openKpiDrilldown(card: any) {
  const metricMap: Record<string, DrilldownMetric> = {
    followers: 'fans',
    views: 'play',
    likes: 'interactions',
    accounts: 'accounts',
  }
  openDrilldown(metricMap[card.key] || 'fans', `${card.label}账号明细`)
}

function openStatDrilldown(stat: any) {
  openDrilldown(stat.type, `${dateTypeLabel.value}${stat.text}账号明细`)
}

function openDrilldown(metric: DrilldownMetric, title: string) {
  drilldownMetric.value = metric
  drilldownTitle.value = title
  drilldownVisible.value = true
}

function openAccountDetail(row: any) {
  if (!row?.id) return
  router.push(`/accounts/${row.id}`)
}

// ─── Charts ───
const trendChartOption = computed<EChartsOption>(() => {
  const data = trendChartData.value
  const labels = data.map((d: any) => d.date?.slice(5)) // MM-DD
  const values = data.map((d: any) => Number(d.value) || 0)
  const finiteValues = values.filter((value: number) => Number.isFinite(value))
  const minValue = finiteValues.length ? Math.min(...finiteValues) : 0
  const maxValue = finiteValues.length ? Math.max(...finiteValues) : 0
  const range = Math.max(maxValue - minValue, Math.max(Math.abs(maxValue), 1) * 0.01)
  const padding = range * 0.35
  const yMin = Math.max(0, Math.floor(minValue - padding))
  const yMax = Math.ceil(maxValue + padding)
  const nameMap: Record<string, string> = {
    followers: '粉丝',
    views: '播放量',
    engagement: '互动率(%)',
  }
  return mergeOption({
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: any) =>
        trendMetric.value === 'engagement' ? `${Number(value || 0).toFixed(2)}%` : formatNum(Number(value || 0)),
    },
    xAxis: { type: 'category', data: labels, boundaryGap: false },
    yAxis: {
      type: 'value',
      min: yMin,
      max: yMax > yMin ? yMax : undefined,
      scale: true,
      splitNumber: 4,
      axisLabel: {
        formatter: (value: number) =>
          trendMetric.value === 'engagement' ? `${value}%` : formatNum(value),
      },
    },
    series: [
      {
        name: nameMap[trendMetric.value] || '',
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 7,
        showSymbol: true,
        areaStyle: {
          opacity: 0.18,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(99, 102, 241, 0.4)' },
              { offset: 1, color: 'rgba(99, 102, 241, 0)' },
            ],
          },
        },
        lineStyle: { width: 3, color: accent },
        itemStyle: { color: accent },
      },
    ],
  })
})

const platformChartOption = computed<EChartsOption>(() => {
  const d = platformChartData.value
  return mergeOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    xAxis: { type: 'category', data: d.platforms },
    yAxis: { type: 'value' },
    series: [
      {
        name: '播放量',
        type: 'bar',
        data: d.views,
        barMaxWidth: 32,
        itemStyle: { color: accent, borderRadius: [6, 6, 0, 0] },
      },
      {
        name: '互动',
        type: 'bar',
        data: d.likes,
        barMaxWidth: 32,
        itemStyle: { color: info, borderRadius: [6, 6, 0, 0] },
      },
    ],
  })
})

// ─── Helpers ───
function formatNum(n: number): string {
  if (n == null) return '-'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

const AVATAR_PALETTE = [
  '#6366f1',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
]
function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

onMounted(() => {
  refreshAll()
})
</script>

<style lang="scss" scoped>
.matrix-dashboard {
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;

  @media (max-width: 768px) {
    padding: 16px;
  }
  @media (max-width: 480px) {
    padding: 12px;
  }
}

// ─── Header ───
.md-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 32px;
  flex-wrap: wrap;
  gap: 16px;
  @media (max-width: 768px) {
    margin-bottom: 20px;
  }
  &__left {
    h2 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--color-text-primary);
      @media (max-width: 480px) {
        font-size: 20px;
      }
    }
  }
  &__sub {
    margin: 6px 0 0;
    color: var(--color-text-tertiary);
    font-size: 13px;
  }
  &__right {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: flex-end;
    @media (max-width: 768px) {
      width: 100%;
      flex-wrap: wrap;
      .filter-select {
        flex: 1;
        min-width: 100px;
      }
    }
  }
}
.filter-select {
  width: 110px;
}
.group-select {
  width: 160px;
}

// ─── Skeleton / Empty / Error ───
.md-skeleton {
  padding: 48px 0;
}
.md-empty {
  padding: 64px 0;
}
.md-error {
  margin-bottom: 16px;
}

.md-alerts {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}

.md-alert {
  border-radius: 8px;
}

// ─── KPIs ───
.md-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 480px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-bottom: 16px;
  }
}
.md-kpi-card {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  transition: all 0.2s var(--ease-out);
  position: relative;
  overflow: hidden;
  outline: none;
  @media (max-width: 480px) {
    padding: 14px 12px;
  }
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 100% 0%, rgba(99, 102, 241, 0.06), transparent 60%);
    opacity: 0;
    transition: opacity 0.25s var(--ease-out);
    pointer-events: none;
  }
  &:hover {
    border-color: var(--color-border-hover);
    transform: translateY(-2px);
    box-shadow: var(--shadow-md);
    &::before {
      opacity: 1;
    }
  }
  &:focus-visible {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.22);
  }
  &__label {
    font-size: 12px;
    color: var(--color-text-tertiary);
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
  }
  &__value {
    font-size: 30px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
    color: var(--color-text-primary);
    font-family: var(--font-mono);
    @media (max-width: 480px) {
      font-size: 22px;
    }
  }
  &__trend {
    margin-top: 8px;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 2px;
    &.is-up {
      color: var(--color-success);
    }
    &.is-down {
      color: var(--color-danger);
    }
    &.is-none {
      color: var(--color-text-tertiary);
    }
  }
  &__trend-label {
    color: var(--color-text-tertiary);
    margin-left: 4px;
    font-size: 12px;
  }
}

// ─── Sections ───
.md-section {
  margin-bottom: 24px;
  min-width: 0;
  @media (max-width: 768px) {
    margin-bottom: 16px;
  }
}
.md-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 10px;
  flex-wrap: wrap;
  &-right {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
}
.md-period-summary {
  color: var(--color-text-tertiary);
  font-size: 12px;
  margin-left: auto;
}

// ─── Platform Row ───
.md-platform-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 24px;
  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
  @media (max-width: 768px) {
    margin-bottom: 16px;
  }
}
.md-chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--color-text-tertiary);
  font-size: 14px;
}

// ─── Stats Bar (日/周/月) ───
.md-date-hint {
  color: var(--color-text-tertiary);
  font-size: 12px;
  margin-left: 4px;
}
.md-stats-bar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-top: 16px;
  @media (max-width: 900px) {
    grid-template-columns: repeat(3, 1fr);
  }
  @media (max-width: 480px) {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
}
.md-stat-item {
  text-align: center;
  padding: 20px 14px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  outline: none;
  transition:
    border-color 0.2s var(--ease-out),
    transform 0.2s var(--ease-out),
    box-shadow 0.2s var(--ease-out);
  @media (max-width: 480px) {
    padding: 12px 8px;
  }
  &:hover {
    border-color: var(--color-border-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }
  &:focus-visible {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.22);
  }
  &__label {
    font-size: 13px;
    color: var(--color-text-tertiary);
    margin-bottom: 10px;
    letter-spacing: 0.02em;
  }
  &__value {
    font-size: 28px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-primary);
    font-family: var(--font-mono);
    letter-spacing: -0.02em;
    @media (max-width: 480px) {
      font-size: 20px;
    }
  }
  &__trend {
    margin-top: 6px;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    &.is-up {
      color: var(--color-success);
    }
    &.is-down {
      color: var(--color-danger);
    }
  }
  &__trend-label {
    color: var(--color-text-tertiary);
    margin-left: 3px;
    font-size: 11px;
  }
}

// ─── Account Table ───
.md-table-subtitle {
  color: var(--color-text-tertiary);
  font-size: 12px;
  margin-left: 8px;
}

.md-account-table {
  width: 100%;

  :deep(.el-table__inner-wrapper) {
    min-width: 990px;
  }

  :deep(.el-table__cell) {
    white-space: nowrap;
  }

  :deep(.cell) {
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.online-light {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;

  &--online {
    color: var(--color-success);
  }

  &--offline {
    color: var(--color-danger);
  }
}

.online-light__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.06);
}

// ─── Group Comparison ───
.md-group-insight {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;

  &--info {
    background: rgba(99, 102, 241, 0.08);
    color: #818cf8;
    border: 1px solid rgba(99, 102, 241, 0.2);
  }
  &--success {
    background: rgba(16, 185, 129, 0.08);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.2);
  }
  &--warning {
    background: rgba(245, 158, 11, 0.08);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.2);
  }
}

.group-rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 600;

  &.group-rank-1 {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }
  &.group-rank-2 {
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
  }
  &.group-rank-3 {
    background: rgba(217, 119, 6, 0.15);
    color: #d97706;
  }
}

.group-sub-metric {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin-top: 2px;
}

.group-bar-track {
  height: 4px;
  margin-top: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.group-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #6366f1, #818cf8);
  transition: width 0.3s ease;
}

.engagement-rate--high {
  color: #34d399;
  font-weight: 600;
}
.engagement-rate--mid {
  color: var(--color-text-secondary);
}
.engagement-rate--low {
  color: #f87171;
}

// ─── Stale data row styles ───
:deep(.row-stale) {
  td {
    background: rgba(245, 158, 11, 0.04) !important;
  }
}
.cell-nickname {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.md-clickable,
:deep(.el-table__row) {
  cursor: pointer;
}
.account-link {
  max-width: 100%;
  min-height: 0;
  padding: 0;
  font-weight: 600;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}
.drilldown-account {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  &__meta {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  &--historical {
    opacity: 0.72;
  }
}
.md-drilldown__section-title {
  margin-bottom: 10px;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 700;
}
.md-drilldown__history {
  margin-top: 14px;
  border-top: 1px solid var(--el-border-color-lighter);

  :deep(.el-collapse-item__header) {
    background: transparent;
  }

  &-title {
    color: var(--color-text-tertiary);
    font-size: 13px;
    font-weight: 600;

    em {
      margin-left: 8px;
      color: var(--color-text-quaternary, #8b90a8);
      font-size: 12px;
      font-style: normal;
      font-weight: 400;
    }
  }
}
.collection-tag {
  display: inline-flex;
  min-width: 74px;
  justify-content: center;
}
.stale-value {
  color: var(--color-text-tertiary);
  font-style: italic;
}
</style>
