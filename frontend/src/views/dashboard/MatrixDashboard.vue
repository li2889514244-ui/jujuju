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
          </div>
        </div>
      </el-card>

      <!-- 多账号明细 -->
      <el-card shadow="hover" class="md-section">
        <template #header>
          <div class="md-section__header">
            <span>多账号明细</span>
            <span class="md-table-subtitle">展示数据为账号最近30天累计获取得到的最新数据</span>
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
              <el-avatar :size="32" :src="row.avatar" />
            </template>
          </el-table-column>
          <el-table-column prop="nickname" label="账号名称" min-width="120">
            <template #default="{ row }">
              <el-text truncated>{{ row.nickname }}</el-text>
            </template>
          </el-table-column>
          <el-table-column
            prop="fansFormatted"
            label="粉丝数"
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

      <!-- Ranking -->
      <el-card shadow="hover" class="md-section">
        <template #header>
          <div class="md-section__header">
            <span>排行榜</span>
            <div class="md-section__header-right">
              <el-radio-group v-model="rankingPeriod" size="small" @change="refreshAll">
                <el-radio-button value="week">周榜</el-radio-button>
                <el-radio-button value="month">月榜</el-radio-button>
                <el-radio-button value="all">总榜</el-radio-button>
              </el-radio-group>
            </div>
          </div>
        </template>
        <div class="md-ranking-tabs">
          <el-radio-group v-model="rankingTab" size="small">
            <el-radio-button value="views">播放量排行</el-radio-button>
            <el-radio-button value="engagement">互动率排行</el-radio-button>
          </el-radio-group>
        </div>
        <el-table
          :data="currentRanking.slice(0, 20)"
          stripe
          size="small"
          max-height="520"
          empty-text="暂无排行数据"
          @row-click="handleRankingClick"
        >
          <el-table-column label="#" width="50" align="center">
            <template #default="{ row }">
              <span class="rank-badge" :class="'rank-' + Math.min(row.rank, 3)">{{
                row.rank
              }}</span>
            </template>
          </el-table-column>
          <el-table-column label="内容" min-width="240">
            <template #default="{ row }">
              <div class="ranking-title">{{ row.title || '无标题' }}</div>
              <div class="ranking-meta">
                <PlatformIcon :platform="row.platform" />
                <span>{{ row.accountName }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="播放量" width="100" align="right" sortable>
            <template #default="{ row }">{{ formatNum(row.views) }}</template>
          </el-table-column>
          <el-table-column label="互动" width="80" align="right">
            <template #default="{ row }">{{ formatNum(row.likes) }}</template>
          </el-table-column>
          <el-table-column label="互动率" width="80" align="right" sortable>
            <template #default="{ row }">{{ row.engagementRate?.toFixed(1) }}%</template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- Tags -->
      <el-card v-if="tags.length > 0" shadow="hover" class="md-section">
        <template #header><span>标签表现</span></template>
        <div class="md-tags">
          <span
            v-for="tag in tags.slice(0, 30)"
            :key="tag.name"
            class="md-tag"
            :style="{ fontSize: tagSize(tag.count) + 'px' }"
          >
            {{ tag.name }}<sup>{{ tag.count }}</sup>
          </span>
        </div>
      </el-card>
    </template>

    <!-- Post Detail Drawer -->
    <PostDetailDrawer ref="detailDrawerRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMatrixDashboard } from '@/composables/useMatrixDashboard'
import { useChartTheme } from '@/composables/useChartTheme'
import DataChart from '@/components/common/DataChart.vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import PostDetailDrawer from '@/components/common/PostDetailDrawer.vue'
import { CaretTop, CaretBottom } from '@element-plus/icons-vue'
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
  rankingPeriod,
  rankingTab,
  trendMetric,
  overview,
  kpiCards,
  aggregatedStats,
  platformStats,
  platformTableData,
  platformChartData,
  trendChartData,
  currentRanking,
  tags,
  accountTableData,
  toggleSort,
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

// ─── Helpers ───
function formatNum(n: number): string {
  if (n == null) return '-'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

function tagSize(count: number): number {
  const max = tags.value[0]?.count || 1
  const ratio = count / max
  return 13 + ratio * 11 // 13-24px
}

const detailDrawerRef = ref()
function handleRankingClick(row: any) {
  detailDrawerRef.value?.open(row)
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

// ─── Ranking ───
.md-ranking-tabs {
  margin-bottom: 12px;
}
.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  &.rank-1 {
    background: #f59e0b20;
    color: #f59e0b;
  }
  &.rank-2 {
    background: #94a3b820;
    color: #94a3b8;
  }
  &.rank-3 {
    background: #d9770620;
    color: #d97706;
  }
}
.ranking-title {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 400px;
}
.ranking-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: 2px;
}

// ─── Tags ───
.md-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: baseline;
  padding: 8px 0;
}
.md-tag {
  color: var(--color-accent);
  cursor: pointer;
  font-weight: 500;
  transition: opacity 0.2s;
  sup {
    font-size: 0.7em;
    color: var(--color-text-tertiary);
    margin-left: 1px;
  }
  &:hover {
    opacity: 0.75;
  }
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
  padding: 16px 12px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  &__label {
    font-size: 12px;
    color: var(--color-text-secondary);
    margin-bottom: 6px;
  }
  &__value {
    font-size: 22px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

// ─── Account Table ───
.md-table-subtitle {
  color: var(--color-text-tertiary);
  font-size: 12px;
  margin-left: 8px;
}
</style>
