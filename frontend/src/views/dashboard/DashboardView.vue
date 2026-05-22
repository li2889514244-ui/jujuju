<template>
  <div class="dashboard">
    <StarField :opacity="0.6" />

    <!-- Hero KPI: 霓虹大数字 -->
    <div class="dashboard__hero" v-if="accountRows.length > 0">
      <div class="hero-ring"></div>
      <div class="hero-core">
        <span class="hero-value neon-text">{{ formatLargeNum(groupSummaryCards[0]?.rawValue || 0) }}</span>
        <span class="hero-label">总粉丝</span>
      </div>
    </div>

    <!-- 次级指标 + 操作 -->
    <div class="dashboard__sub-row" v-if="accountRows.length > 0">
      <div class="sub-kpis">
        <span class="sub-kpi" v-for="card in groupSummaryCards.slice(1)" :key="card.label">
          <b class="gradient-text">{{ formatLargeNum(card.rawValue) }}</b>
          <small>{{ card.label }}</small>
        </span>
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

    <!-- 分组切换 -->
    <div class="dashboard__groups" v-if="accountGroups.length > 0">
      <el-select v-model="selectedGroup" size="small" @change="onGroupChange" placeholder="全部" style="width:120px">
        <el-option label="全部" value="all" />
        <el-option v-for="g in accountGroups" :key="g.name" :label="g.name" :value="g.name" />
      </el-select>
    </div>

    <!-- 图表区 -->
    <div class="dashboard__charts" v-if="accountRows.length > 0">
      <div class="neon-card stagger-item">
        <div class="chart-header">
          <span class="chart-title">增长趋势</span>
          <el-radio-group v-model="trendDays" size="small" @change="loadFollowerTrend">
            <el-radio-button :value="7">7天</el-radio-button>
            <el-radio-button :value="30">30天</el-radio-button>
          </el-radio-group>
        </div>
        <DataChart :option="followerChartOption" :height="280" />
      </div>
      <div class="neon-card stagger-item">
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
        <router-link to="/accounts" class="section-header__link">全部 →</router-link>
      </div>
      <div class="account-grid">
        <router-link
          v-for="(acc, i) in displayAccounts"
          :key="acc.id"
          :to="`/accounts/${acc.id}`"
          class="account-card stagger-item"
        >
          <el-avatar :size="36" :src="acc.avatar" :style="{
            background: acc.avatar ? '' : `linear-gradient(135deg, ${platformGradient(acc.platform)})`,
            color: '#fff',
            boxShadow: `0 0 12px ${platformGlow(acc.platform)}`
          }">
            {{ acc.nickname?.charAt(0) }}
          </el-avatar>
          <span class="account-card__name">{{ acc.nickname }}</span>
          <PlatformBadge :platform="acc.platform" size="sm" />
        </router-link>
      </div>
    </div>

    <!-- 空状态 -->
    <div class="dashboard__empty" v-if="accountRows.length === 0 && !loading">
      <div class="empty-state">
        <div class="empty-state__icon">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="38" stroke="url(#eg)" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.5"/>
            <defs><linearGradient id="eg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#00d4ff"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs>
            <circle cx="40" cy="40" r="12" stroke="#00d4ff" stroke-width="0.5" opacity="0.3">
              <animate attributeName="r" values="12;20;12" dur="3s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite"/>
            </circle>
            <circle cx="40" cy="40" r="4" fill="#00d4ff" opacity="0.6"/>
          </svg>
        </div>
        <h3 class="empty-state__title gradient-text">连接你的第一个账号</h3>
        <p class="empty-state__desc">绑定社交媒体账号，开始矩阵管理与数据分析</p>
        <el-button type="primary" size="large" @click="$router.push('/accounts')">添加账号</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import dayjs from 'dayjs'
import { Refresh } from '@element-plus/icons-vue'
import DataChart from '@/components/common/DataChart.vue'
import StarField from '@/components/common/StarField.vue'
import PlatformBadge from '@/components/common/PlatformBadge.vue'
import { useDashboard } from '@/composables/useDashboard'
import { formatLargeNum, tokenStatusLabel } from '@/utils/format'

const platformGradient = (p: string) => {
  const map: Record<string, string> = {
    DOUYIN: '#00d4ff, #0a0e1a', KUAISHOU: '#ff6b35, #0a0e1a',
    XIAOHONGSHU: '#ff3366, #0a0e1a', BILIBILI: '#fb7299, #0a0e1a',
    WEIBO: '#ffb800, #0a0e1a', WECHAT_VIDEO: '#00e396, #0a0e1a',
  }
  return map[p] || '#00d4ff, #7c3aed'
}
const platformGlow = (p: string) => {
  const map: Record<string, string> = {
    DOUYIN: 'rgba(0,212,255,0.3)', KUAISHOU: 'rgba(255,107,53,0.3)',
    XIAOHONGSHU: 'rgba(255,51,102,0.3)', BILIBILI: 'rgba(251,114,153,0.3)',
    WEIBO: 'rgba(255,184,0,0.3)', WECHAT_VIDEO: 'rgba(0,227,150,0.3)',
  }
  return map[p] || 'rgba(0,212,255,0.3)'
}

const {
  period, loading, trendDays, selectedGroup,
  accountRows, accountGroups, displayAccounts, groupSummaryCards,
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
    padding: $space-3xl 0 $space-xl;
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

// Hero ring animation
.hero-ring {
  position: absolute;
  width: 200px; height: 200px;
  border-radius: 50%;
  border: 1px solid rgba(0, 212, 255, 0.08);
  animation: ring-spin 20s linear infinite;
  &::before {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 1px solid rgba(124, 58, 237, 0.06);
    animation: ring-spin 15s linear infinite reverse;
  }
}
@keyframes ring-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.hero-core {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $space-sm;
  z-index: 1;
}

.hero-value {
  font-size: 80px;
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1;
  font-feature-settings: 'tnum';
  font-variant-numeric: tabular-nums;
  filter: drop-shadow(0 0 20px rgba(0, 212, 255, 0.3));
}

.hero-label {
  font-size: $text-body;
  color: $color-text-tertiary;
  text-transform: uppercase;
  letter-spacing: 0.15em;
}

// Sub KPIs
.sub-kpis { display: flex; gap: $space-3xl; }
.sub-kpi {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  b {
    font-size: $text-headline;
    font-weight: 700;
    font-feature-settings: 'tnum';
  }
  small {
    font-size: $text-micro;
    color: $color-text-tertiary;
    text-transform: uppercase;
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
  font-size: $text-caption;
  color: $color-text-secondary;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

// Section header
.section-header {
  display: flex;
  align-items: baseline;
  gap: $space-sm;
  &__title {
    font-size: $text-micro;
    font-weight: 600;
    color: $color-text-tertiary;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  &__count {
    font-size: $text-caption;
    color: $color-cyan;
  }
  &__link {
    font-size: $text-caption;
    color: $color-cyan;
    text-decoration: none;
    font-weight: 500;
    margin-left: auto;
    transition: color 0.2s;
    &:hover { color: $color-purple; }
  }
}

// Account grid
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
  background: rgba(16, 24, 48, 0.4);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid $color-border;
  text-decoration: none;
  transition: all 0.3s $ease-out;
  cursor: pointer;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(0,212,255,0), rgba(124,58,237,0));
    transition: opacity 0.3s;
    opacity: 0;
  }
  &:hover {
    border-color: rgba(0, 212, 255, 0.3);
    box-shadow: 0 0 20px rgba(0, 212, 255, 0.1);
    transform: translateY(-2px);
    &::before {
      background: linear-gradient(135deg, rgba(0,212,255,0.04), rgba(124,58,237,0.04));
      opacity: 1;
    }
  }
  &__name {
    flex: 1;
    font-size: $text-body;
    font-weight: 600;
    color: $color-text-primary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
}

// Empty state
.empty-state {
  display: flex; flex-direction: column; align-items: center; gap: 24px; text-align: center;
  &__icon { opacity: 0.8; }
  &__title { font-size: $text-headline; font-weight: 700; margin: 0; }
  &__desc { font-size: $text-body; color: $color-text-secondary; margin: 0; max-width: 320px; }
}
</style>
