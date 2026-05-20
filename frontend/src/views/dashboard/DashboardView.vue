<template>
  <div class="dashboard">
    <!-- Hero KPI: 唯一的视觉焦点 -->
    <div class="dashboard__hero-kpi" v-if="accountRows.length > 0">
      <span class="hero-kpi__value">{{ formatLargeNum(groupSummaryCards[0]?.rawValue || 0) }}</span>
      <span class="hero-kpi__label">总粉丝</span>
    </div>

    <!-- 次级指标 + 操作（同一行，低调） -->
    <div class="dashboard__sub-row" v-if="accountRows.length > 0">
      <div class="dashboard__sub-kpis">
        <span class="sub-kpi" v-for="card in groupSummaryCards.slice(1)" :key="card.label">
          <b>{{ formatLargeNum(card.rawValue) }}</b>
          <small>{{ card.label }}</small>
        </span>
      </div>
      <div class="dashboard__sub-actions">
        <el-radio-group v-model="period" size="small" @change="onPeriodChange">
          <el-radio-button value="day">日</el-radio-button>
          <el-radio-button value="week">周</el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="exportCSV" :disabled="accountRows.length === 0"
          >导出</el-button
        >
        <el-button :icon="Refresh" size="small" circle @click="refreshAll" :loading="loading" />
      </div>
    </div>

    <!-- 分组切换（有分组时才显示） -->
    <div class="dashboard__groups" v-if="accountGroups.length > 0">
      <el-select
        v-model="selectedGroup"
        size="small"
        @change="onGroupChange"
        placeholder="全部"
        style="width: 120px"
      >
        <el-option label="全部" value="all" />
        <el-option v-for="g in accountGroups" :key="g.name" :label="g.name" :value="g.name" />
      </el-select>
    </div>

    <!-- 图表区 -->
    <div class="dashboard__charts" v-if="accountRows.length > 0">
      <GlassCard class="stagger-item">
        <template #header>
          <div class="chart-header">
            <span>增长趋势</span>
            <el-radio-group v-model="trendDays" size="small" @change="loadFollowerTrend">
              <el-radio-button :value="7">7天</el-radio-button>
              <el-radio-button :value="30">30天</el-radio-button>
            </el-radio-group>
          </div>
        </template>
        <DataChart :option="followerChartOption" :height="280" />
      </GlassCard>
      <GlassCard title="平台分布" class="stagger-item">
        <DataChart :option="platformChartOption" :height="280" />
      </GlassCard>
    </div>

    <!-- 账号卡片网格 -->
    <div class="dashboard__accounts" v-if="accountRows.length > 0">
      <div class="section-header">
        <span class="section-header__title">账号</span>
        <span class="section-header__count">{{ accountRows.length }}</span>
        <router-link to="/accounts" class="section-header__link">全部 →</router-link>
      </div>
      <div class="account-grid">
        <router-link
          v-for="(acc, i) in displayAccounts"
          :key="acc.id"
          :to="`/accounts/${acc.id}`"
          class="account-card stagger-item"
        >
          <el-avatar :size="36" :src="acc.avatar" :style="{ background: acc.avatar ? '' : platformColor(acc.platform), color: '#fff' }">{{ acc.nickname?.charAt(0) }}</el-avatar>
          <span class="account-card__name">{{ acc.nickname }}</span>
          <PlatformBadge :platform="acc.platform" size="sm" />
        </router-link>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="dashboard__empty" v-if="accountRows.length === 0 && !loading">
      <el-button type="primary" size="large" @click="$router.push('/accounts')"
        >添加第一个账号</el-button
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { Refresh } from '@element-plus/icons-vue'
import DataChart from '@/components/common/DataChart.vue'
import GlassCard from '@/components/common/GlassCard.vue'
import PlatformBadge from '@/components/common/PlatformBadge.vue'
import { useDashboard } from '@/composables/useDashboard'
import { formatLargeNum, tokenStatusLabel } from '@/utils/format'
import { getPlatformColor as platformColor } from '@/composables/usePlatform'

const {
  period,
  loading,
  trendDays,
  selectedGroup,
  accountRows,
  accountGroups,
  displayAccounts,
  groupSummaryCards,
  refreshAll,
  loadFollowerTrend,
  onPeriodChange,
  onGroupChange,
  followerChartOption,
  platformChartOption,
} = useDashboard()

function exportCSV() {
  const headers = ['账号', '平台', '粉丝', '播放量', '点赞', '评论', '分享', '内容数', '状态']
  const rows = accountRows.value.map((r) => [
    r.nickname,
    r.platform,
    r.followers,
    r.views,
    r.likes,
    r.comments,
    r.shares,
    r.postCount,
    tokenStatusLabel(r),
  ])
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `账号数据_${dayjs().format('YYYY-MM-DD')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<style lang="scss" scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: $section-gap;

  // === Hero KPI — THE focal point ===
  &__hero-kpi {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: $space-sm;
    padding: $space-3xl 0 $space-xl;
    position: relative;
    &::after {
      content: '';
      width: 40px; height: 3px;
      background: var(--el-color-primary);
      border-radius: 2px;
      margin-top: $space-lg;
    }
  }

  // === Sub KPIs + actions ===
  &__sub-row {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    gap: $space-2xl;
  }
  &__sub-kpis {
    display: flex;
    gap: $space-3xl;
  }
  &__sub-actions {
    display: flex;
    align-items: center;
    gap: $space-sm;
    padding-left: $space-2xl;
    border-left: 1px solid var(--el-border-color-light);
  }

  // === Groups ===
  &__groups {
    display: flex;
    justify-content: center;
  }

  // === Charts ===
  &__charts {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: $space-lg;
  }

  // === Account cards ===
  &__accounts {
    display: flex;
    flex-direction: column;
    gap: $space-lg;
  }

  // === Empty ===
  &__empty {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
  }
}

// === Hero number ===
.hero-kpi {
  &__value {
    font-size: 80px;
    font-weight: 700;
    color: var(--el-text-color-primary);
    letter-spacing: -0.04em;
    line-height: 1;
    font-feature-settings: 'tnum';
    font-variant-numeric: tabular-nums;
  }
  &__label {
    font-size: $text-body;
    color: var(--el-text-color-placeholder);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
}

// === Secondary KPI line ===
.sub-kpi {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  b {
    font-size: $text-headline;
    font-weight: 700;
    color: var(--el-text-color-primary);
    font-feature-settings: 'tnum';
  }
  small {
    font-size: $text-micro;
    color: var(--el-text-color-placeholder);
    text-transform: uppercase;
  }
}

// === Section header ===
.section-header {
  display: flex;
  align-items: baseline;
  gap: $space-sm;
  &__title {
    font-size: $text-micro;
    font-weight: 600;
    color: var(--el-text-color-placeholder);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  &__count {
    font-size: $text-caption;
    color: var(--el-text-color-placeholder);
  }
  &__link {
    font-size: $text-caption;
    color: #0a84ff;
    text-decoration: none;
    font-weight: 500;
    margin-left: auto;
    &:hover {
      text-decoration: underline;
    }
  }
}

// === Chart header ===
.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

// === Account grid ===
.account-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: $space-lg;
}

.account-card {
  display: flex;
  align-items: center;
  gap: $space-sm;
  padding: $space-md $space-lg;
  border-radius: $radius-md;
  background: var(--el-fill-color-light);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--el-border-color);
  text-decoration: none;
  transition: all 0.2s $ease-out;
  cursor: pointer;

  &:hover {
    border-color: #0a84ff;
    background: rgba(#0a84ff, 0.04);
  }

  &__name {
    flex: 1;
    font-size: $text-body;
    font-weight: 600;
    color: var(--el-text-color-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
}
</style>
