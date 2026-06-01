<template>
  <div class="dashboard">
    <!-- Hero KPI -->
    <div class="dashboard__hero" v-if="accountRows.length > 0">
      <p class="hero-label">总粉丝</p>
      <p class="hero-value display-number">{{ formatLargeNum(groupSummaryCards[0]?.rawValue || 0) }}</p>
      <div class="hero-rule"></div>
    </div>

    <!-- 次级指标 + 操作 -->
    <div class="dashboard__sub-row" v-if="accountRows.length > 0">
      <div class="sub-kpis">
        <div class="sub-kpi" v-for="card in groupSummaryCards.slice(1)" :key="card.label">
          <span class="sub-kpi__value display-number">{{ formatLargeNum(card.rawValue) }}</span>
          <span class="sub-kpi__label">{{ card.label }}</span>
        </div>
      </div>
      <div class="sub-actions">
        <el-radio-group v-model="period" size="small" @change="onPeriodChange">
          <el-radio-button value="day">日</el-radio-button>
          <el-radio-button value="week">周</el-radio-button>
        </el-radio-group>
        <el-button size="small" @click="exportCSV" :disabled="accountRows.length === 0">导出</el-button>
        <el-button :icon="Refresh" size="small" circle @click="refreshAll" :loading="loading" />
      </div>
    </div>

    <!-- 时间维度对比卡片 -->
    <div class="dashboard__time-cards" v-if="accountRows.length > 0">
      <StatCard
        v-for="(card, idx) in timeComparisonCards"
        :key="card.label"
        :label="card.label"
        :value="card.rawValue"
        :formatter="formatLargeNum"
        :trend="card.trend"
        :trend-label="card.label.startsWith('今日') ? '较昨日' : card.label.startsWith('昨日') ? '较前日' : card.label.startsWith('本周') ? '较上周' : '较上月'"
        :accent-color="card.color"
        :animated="false"
        :delay="idx * 80"
      />
    </div>

    <!-- 分组切换 -->
    <div class="dashboard__groups" v-if="accountGroups.length > 0">
      <el-select v-model="selectedGroup" size="small" @change="onGroupChange" style="width:120px">
        <el-option label="全部" value="all" />
        <el-option v-for="g in accountGroups" :key="g.name" :label="g.name" :value="g.name" />
      </el-select>
    </div>

    <!-- 图表区 -->
    <div class="dashboard__charts" v-if="accountRows.length > 0">
      <div class="card-default stagger-item">
        <div class="chart-header">
          <span class="chart-title">增长趋势</span>
          <el-radio-group v-model="trendDays" size="small" @change="loadFollowerTrend">
            <el-radio-button :value="7">7 天</el-radio-button>
            <el-radio-button :value="30">30 天</el-radio-button>
          </el-radio-group>
        </div>
        <DataChart :option="followerChartOption" :height="280" />
      </div>
      <div class="card-default stagger-item">
        <div class="chart-header">
          <span class="chart-title">平台分布</span>
        </div>
        <DataChart :option="platformChartOption" :height="280" />
      </div>
    </div>

    <!-- 账号卡片 -->
    <div class="dashboard__accounts" v-if="accountRows.length > 0">
      <div class="section-header">
        <span class="section-header__title">账号</span>
        <span class="section-header__count">{{ accountRows.length }}</span>
        <router-link to="/accounts" class="section-header__link">查看全部</router-link>
      </div>
      <div class="account-grid">
        <router-link
          v-for="(acc, i) in displayAccounts"
          :key="acc.id"
          :to="`/accounts/${acc.id}`"
          class="account-card stagger-item"
          :style="{ transitionDelay: `${i * 40}ms` }"
        >
          <el-avatar :size="34" :src="acc.avatar">
            {{ acc.nickname?.charAt(0) }}
          </el-avatar>
          <div class="account-card__info">
            <span class="account-card__name">{{ acc.nickname }}</span>
            <PlatformBadge :platform="acc.platform" size="sm" />
          </div>
          <el-icon :size="14" class="account-card__arrow"><ArrowRight /></el-icon>
        </router-link>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="dashboard__empty" v-if="accountRows.length === 0 && !loading">
      <div class="empty-state">
        <div class="empty-state__icon">
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
            <rect x="8" y="12" width="56" height="48" rx="8" stroke="#d49b50" stroke-width="1" opacity="0.3" />
            <circle cx="36" cy="36" r="14" stroke="#d49b50" stroke-width="1" opacity="0.15" stroke-dasharray="4 4" />
            <circle cx="36" cy="36" r="5" fill="#d49b50" opacity="0.4" />
          </svg>
        </div>
        <h3 class="empty-state__title">连接你的第一个账号</h3>
        <p class="empty-state__desc">绑定社交媒体账号，开始矩阵管理与数据分析</p>
        <el-button type="primary" size="large" @click="$router.push('/accounts')">添加账号</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { Refresh, ArrowRight } from '@element-plus/icons-vue'
import DataChart from '@/components/common/DataChart.vue'
import PlatformBadge from '@/components/common/PlatformBadge.vue'
import StatCard from '@/components/common/StatCard.vue'
import { useDashboard } from '@/composables/useDashboard'
import { formatLargeNum, tokenStatusLabel } from '@/utils/format'

const {
  period, loading, trendDays, selectedGroup,
  accountRows, accountGroups, displayAccounts, groupSummaryCards, timeComparisonCards,
  refreshAll, loadFollowerTrend, onPeriodChange, onGroupChange,
  followerChartOption, platformChartOption,
} = useDashboard()

function exportCSV() {
  const headers = ['账号', '平台', '粉丝', '播放量', '点赞', '评论', '分享', '内容数', '状态']
  const rows = accountRows.value.map((r) => [
    r.nickname, r.platform, r.followers, r.views, r.likes,
    r.comments, r.shares, r.postCount, tokenStatusLabel(r),
  ])
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `账号数据_${dayjs().format('YYYY-MM-DD')}.csv`; a.click()
  URL.revokeObjectURL(url)
}
</script>

<style lang="scss" scoped>
.dashboard {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: $section-gap;
  min-height: 100%;

  &__hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: $space-3xl 0 $space-lg;
    position: relative;
    z-index: 1;
  }
  &__sub-row {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    gap: $space-2xl;
    position: relative;
    z-index: 1;
  }
  &__groups {
    display: flex;
    justify-content: center;
    position: relative;
    z-index: 1;
  }
  &__time-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: $space-md;
    position: relative;
    z-index: 1;
    padding: 0 $space-lg;
  }
  &__charts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: $space-lg;
    position: relative;
    z-index: 1;
  }
  &__accounts {
    display: flex;
    flex-direction: column;
    gap: $space-lg;
    position: relative;
    z-index: 1;
    padding-bottom: $space-2xl;
  }
  &__empty {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
    position: relative;
    z-index: 1;
  }
}

// Hero
.hero-label {
  font-size: 12px;
  color: $color-text-tertiary;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  margin-bottom: $space-sm;
}
.hero-value {
  font-size: 80px;
  font-weight: 500;
  letter-spacing: -0.03em;
  line-height: 1;
  color: $color-cream;
}
.hero-rule {
  width: 48px;
  height: 2px;
  background: $color-bronze;
  margin-top: 20px;
  border-radius: 1px;
  opacity: 0.5;
}

// Sub KPIs
.sub-kpis {
  display: flex;
  gap: $space-3xl;
}
.sub-kpi {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  &__value {
    font-size: 28px;
    font-weight: 500;
    color: $color-text-primary;
    line-height: 1;
  }
  &__label {
    font-size: 11px;
    color: $color-text-tertiary;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
}
.sub-actions {
  display: flex;
  align-items: center;
  gap: $space-sm;
  padding-left: $space-2xl;
}

// Charts
.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $space-md;
}
.chart-title {
  font-size: 12px;
  font-weight: 500;
  color: $color-text-tertiary;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

// Section header
.section-header {
  display: flex;
  align-items: baseline;
  gap: $space-sm;
  &__title {
    font-size: 12px;
    font-weight: 500;
    color: $color-text-tertiary;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  &__count {
    font-size: 13px;
    color: $color-bronze;
    font-weight: 500;
  }
  &__link {
    font-size: 13px;
    color: $color-text-tertiary;
    text-decoration: none;
    margin-left: auto;
    transition: color 0.2s;
    &:hover { color: $color-bronze; }
  }
}

// Account grid
.account-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: $space-md;
}

.account-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: $radius-md;
  background: $color-bg-secondary;
  border: 1px solid $color-border;
  text-decoration: none;
  transition: all 0.25s $ease-out;
  cursor: pointer;

  &:hover {
    border-color: rgba(212, 155, 80, 0.18);
    background: $color-bg-tertiary;
  }
  &__info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  &__name {
    font-size: 13px;
    font-weight: 500;
    color: $color-text-primary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__arrow {
    color: $color-text-tertiary;
    flex-shrink: 0;
    transition: all 0.2s;
    opacity: 0;
  }
  &:hover &__arrow { opacity: 1; color: $color-bronze; }
}

// Empty state
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  text-align: center;
  &__icon { opacity: 0.7; }
  &__title {
    font-family: $font-display;
    font-size: $text-headline;
    font-weight: 500;
    color: $color-text-primary;
    margin: 0;
  }
  &__desc {
    font-size: $text-body;
    color: $color-text-secondary;
    margin: 0;
    max-width: 320px;
    line-height: 1.6;
  }
}
</style>
