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

      <!-- KPI Cards -->
      <div class="md-kpis">
        <div v-for="card in kpiCards" :key="card.key" class="md-kpi-card">
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
          <div v-for="stat in aggregatedStats" :key="stat.id" class="md-stat-item">
            <div class="md-stat-item__label">{{ stat.text }}</div>
            <div class="md-stat-item__value">{{ formatNum(stat.value) }}</div>
            <div
              v-if="aggregatedTrends[stat.type] !== undefined && aggregatedTrends[stat.type] !== null"
              class="md-stat-item__trend"
              :class="(aggregatedTrends[stat.type] ?? 0) >= 0 ? 'is-up' : 'is-down'"
            >
              <el-icon><CaretTop v-if="(aggregatedTrends[stat.type] ?? 0) >= 0" /><CaretBottom v-else /></el-icon>
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
            <span class="md-table-subtitle">展示{{ dateTypeLabel }}周期数据，当前粉丝为最新快照</span>
          </div>
        </template>
        <el-table
          :data="accountTableData"
          stripe
          size="small"
          max-height="520"
          empty-text="暂无账号数据"
          @sort-change="(sort: any) => toggleSort(sort?.prop || '')"
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
          <el-table-column prop="nickname" label="账号名称" min-width="120">
            <template #default="{ row }">
              <el-text truncated>{{ row.nickname }}</el-text>
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
          />
          <el-table-column
            prop="newFansFormatted"
            label="净增粉丝"
            width="100"
            align="right"
            sortable="custom"
          />
          <el-table-column
            prop="likeFormatted"
            label="点赞"
            width="80"
            align="right"
            sortable="custom"
          />
          <el-table-column
            prop="commentFormatted"
            label="评论"
            width="80"
            align="right"
            sortable="custom"
          />
          <el-table-column
            prop="shareFormatted"
            label="分享"
            width="80"
            align="right"
            sortable="custom"
          />
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
            <el-table-column prop="followersFormatted" label="粉丝" align="right" sortable />
            <el-table-column prop="viewsFormatted" label="播放量" align="right" sortable />
            <el-table-column prop="likesFormatted" label="互动" align="right" />
            <el-table-column prop="engagementRate" label="互动率" width="80" align="right">
              <template #default="{ row }">{{ row.engagementRate }}%</template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>

      <!-- 跨 Group 对比 -->
      <el-card v-if="groupComparison.length > 0" shadow="hover" class="md-section">
        <template #header>
          <div class="md-section__header">
            <span>分组对比</span>
            <span class="md-table-subtitle">按{{ dateTypeLabel }}周期汇总，人均指标消除团队规模差异</span>
          </div>
        </template>

        <!-- 洞察提示 -->
          <div v-if="groupInsight" class="md-group-insight" :class="'md-group-insight--' + groupInsight.type">
            <el-icon :size="16"><TrendCharts /></el-icon>
            <span>{{ groupInsight.text }}</span>
          </div>

        <el-table :data="groupComparison" stripe size="small" empty-text="暂无分组数据">
          <el-table-column label="排名" width="60" align="center">
            <template #default="{ $index }">
              <span class="group-rank-badge" :class="'group-rank-' + Math.min($index + 1, 3)">{{ $index + 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="groupName" label="分组" min-width="120" />
          <el-table-column prop="accountCount" label="账号" width="60" align="right" />
          <el-table-column label="总粉丝" width="110" align="right" sortable :sort-by="'followers'">
            <template #default="{ row }">
              <div>{{ row.followersFormatted }}</div>
              <div class="group-sub-metric">人均 {{ row.avgFollowersFormatted }}</div>
            </template>
          </el-table-column>
          <el-table-column label="播放量" width="120" align="right" sortable :sort-by="'play'">
            <template #default="{ row }">
              <div>{{ row.playFormatted }}</div>
              <div class="group-bar-track">
                <div class="group-bar-fill" :style="{ width: groupBarWidth(row.play) + '%' }" />
              </div>
            </template>
          </el-table-column>
          <el-table-column label="互动量" width="120" align="right" sortable :sort-by="'interactions'">
            <template #default="{ row }">
              <div>{{ row.interactionsFormatted }}</div>
              <div class="group-sub-metric">人均 {{ row.avgInteractionsFormatted }}</div>
            </template>
          </el-table-column>
          <el-table-column label="互动率" width="80" align="right">
            <template #default="{ row }">
              <span :class="engagementRateClass(row)">{{
                row.play > 0 ? (row.interactions / row.play * 100).toFixed(1) : '0.0'
              }}%</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useMatrixDashboard } from '@/composables/useMatrixDashboard'
import { useChartTheme } from '@/composables/useChartTheme'
import DataChart from '@/components/common/DataChart.vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import { CaretTop, CaretBottom, TrendCharts } from '@element-plus/icons-vue'
import { PLATFORM_LABELS } from '@/types'
import type { EChartsOption } from 'echarts'

const { accent, info, mergeOption } = useChartTheme()

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
  aggregatedTrends,
  platformStats,
  platformTableData,
  platformChartData,
  trendChartData,
  accountTableData,
  toggleSort,
  groupComparison,
  refreshAll,
} = useMatrixDashboard()

const platforms = Object.entries(PLATFORM_LABELS).map(([value, label]) => ({ value, label }))

// ─── Charts ───
const trendChartOption = computed<EChartsOption>(() => {
  const data = trendChartData.value
  const labels = data.map((d: any) => d.date?.slice(5)) // MM-DD
  const values = data.map((d: any) => d.value)
  const nameMap: Record<string, string> = {
    followers: '粉丝',
    views: '播放量',
    engagement: '互动率(%)',
  }
  return mergeOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: labels, boundaryGap: false },
    yAxis: { type: 'value' },
    series: [
      {
        name: nameMap[trendMetric.value] || '',
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
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
        lineStyle: { width: 2.5, color: accent },
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

// ─── Group Comparison Helpers ───
const groupInsight = computed(() => {
  const rows = groupComparison.value
  if (rows.length === 0) return null
  if (rows.length === 1) return { type: 'info', text: `当前只有 ${rows[0].groupName} 一个分组，无法横向对比。` }

  const top = rows[0]
  const bottom = rows[rows.length - 1]
  const topRate = top.play > 0 ? (top.interactions / top.play * 100) : 0
  const bottomRate = bottom.play > 0 ? (bottom.interactions / bottom.play * 100) : 0

  if (topRate > bottomRate * 2) {
    return {
      type: 'success',
      text: `${top.groupName} 互动率 ${topRate.toFixed(1)}% 远超 ${bottom.groupName}（${bottomRate.toFixed(1)}%），可复用其内容策略。`,
    }
  }
  if (bottom.followers > top.followers && top.play > bottom.play) {
    return {
      type: 'warning',
      text: `${bottom.groupName} 粉丝最多但播放量落后于 ${top.groupName}，建议检查近期内容发布频率和质量。`,
    }
  }
  return {
    type: 'info',
    text: `${top.groupName} 综合表现领先，人均互动 ${(top.interactions / Math.max(top.accountCount, 1)).toFixed(0)} 次。`,
  }
})

function groupBarWidth(value: number): number {
  const max = Math.max(...groupComparison.value.map((r: any) => r.play || 0), 1)
  return Math.max(2, (value / max * 100))
}

function engagementRateClass(row: any): string {
  const rate = row.play > 0 ? (row.interactions / row.play * 100) : 0
  if (rate >= 5) return 'engagement-rate--high'
  if (rate >= 2) return 'engagement-rate--mid'
  return 'engagement-rate--low'
}

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
}

// ─── Header ───
.md-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 32px;
  flex-wrap: wrap;
  gap: 16px;
  &__left {
    h2 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--color-text-primary);
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

// ─── KPIs ───
.md-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
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
}
.md-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  &-right {
    display: flex;
    gap: 8px;
    align-items: center;
  }
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
}
.md-stat-item {
  text-align: center;
  padding: 20px 14px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: 10px;
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
</style>
