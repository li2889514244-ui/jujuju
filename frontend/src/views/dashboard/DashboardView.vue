<template>
  <div class="dashboard">
    <!-- Loading Skeleton -->
    <template v-if="loading && accountRows.length === 0">
      <div class="dashboard__skeleton">
        <!-- Hero skeleton -->
        <div class="dashboard__hero">
          <el-skeleton :rows="1" animated style="width: 80px; margin: 0 auto" />
          <el-skeleton :rows="1" animated style="width: 200px; height: 80px; margin: 12px auto" />
          <el-skeleton :rows="1" animated style="width: 48px; height: 2px; margin: 20px auto" />
        </div>
        <!-- Sub KPIs skeleton -->
        <div class="dashboard__sub-row">
          <div class="sub-kpis">
            <div v-for="i in 3" :key="i" class="sub-kpi">
              <el-skeleton :rows="2" animated style="width: 80px" />
            </div>
          </div>
        </div>
        <!-- Time comparison cards skeleton -->
        <div class="dashboard__time-cards">
          <div v-for="i in 2" :key="i" class="card-default">
            <el-skeleton :rows="3" animated />
          </div>
        </div>
        <!-- Charts skeleton -->
        <div class="dashboard__charts">
          <div v-for="i in 2" :key="i" class="card-default">
            <el-skeleton :rows="10" animated />
          </div>
        </div>
        <!-- Account cards skeleton -->
        <div class="dashboard__accounts">
          <div class="dashboard__skeleton-row">
            <el-skeleton :rows="1" animated style="width: 48px" />
            <el-skeleton :rows="1" animated style="width: 24px" />
          </div>
          <div class="account-grid">
            <div v-for="i in 4" :key="i" class="account-card" style="pointer-events: none">
              <el-skeleton
                :rows="1"
                animated
                style="width: 34px; height: 34px; border-radius: 50%"
              />
              <el-skeleton :rows="2" animated style="width: 100px" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Actual content (hidden during skeleton) -->
    <template v-else>
      <!-- Command Center -->
      <section class="dashboard__command stagger-item">
        <div class="command-copy">
          <span class="section-label">矩阵账号管理平台</span>
          <h1>账号状态、作品表现、涨粉趋势和销售数据统一看</h1>
          <p>
            {{
              accountRows.length > 0
                ? `当前矩阵已接入 ${accountRows.length} 个账号。先看账号健康，再看内容表现和转化。`
                : '先接入第一个账号，系统会开始沉淀作品数据、涨粉趋势、发布记录和小店销售。'
            }}
          </p>
          <div class="command-meta">
            <span>数据口径：账号粉丝为当前快照</span>
            <span>播放/互动为采集期统计</span>
            <span v-if="lastUpdate">最近刷新 {{ lastUpdate }}</span>
          </div>
        </div>
        <div class="command-actions">
          <router-link to="/accounts" class="command-action command-action--primary">
            <span class="command-action__label">{{
              accountRows.length > 0 ? '管理账号' : '接入账号'
            }}</span>
            <span class="command-action__hint">扫码绑定与分组</span>
          </router-link>
        </div>
      </section>

      <section class="dashboard__runway stagger-item">
        <div class="runway-step" :class="{ 'runway-step--done': accountRows.length > 0 }">
          <span class="runway-step__index">1</span>
          <div>
            <strong>接入账号</strong>
            <span>{{
              accountRows.length > 0 ? '账号已接入，可以继续运营' : '从扫码绑定开始'
            }}</span>
          </div>
        </div>
        <div class="runway-step" :class="{ 'runway-step--ready': accountRows.length > 0 }">
          <span class="runway-step__index">2</span>
          <div>
            <strong>制作内容</strong>
            <span>上传视频、封面和文案</span>
          </div>
        </div>
        <div class="runway-step" :class="{ 'runway-step--ready': accountRows.length > 0 }">
          <span class="runway-step__index">3</span>
          <div>
            <strong>发布复盘</strong>
            <span>排期发布后查看增长趋势</span>
          </div>
        </div>
      </section>

      <section class="dashboard__capabilities stagger-item">
        <router-link to="/accounts" class="capability-card">
          <span class="capability-card__tag">账号矩阵</span>
          <strong>账号状态与分组</strong>
          <span>授权、过期、粉丝、分组和账号详情入口</span>
        </router-link>
        <router-link to="/accounts" class="capability-card">
          <span class="capability-card__tag">作品数据</span>
          <strong>单账号视频明细</strong>
          <span>进入账号详情查看播放、点赞、评论、收藏和互动率</span>
        </router-link>
        <router-link to="/data-center" class="capability-card">
          <span class="capability-card__tag">增长复盘</span>
          <strong>涨粉与平台对比</strong>
          <span>按平台查看播放、互动率、粉丝增长和排行榜</span>
        </router-link>
        <router-link to="/monetization" class="capability-card">
          <span class="capability-card__tag">微信小店</span>
          <strong>销售、订单与售后</strong>
          <span>查看 GMV、订单状态、商品销量和退款提醒</span>
        </router-link>
      </section>

      <!-- Hero KPI -->
      <div v-if="accountRows.length > 0" class="dashboard__hero">
        <p class="hero-label">总粉丝</p>
        <p class="hero-value display-number">
          {{ formatLargeNum(groupSummaryCards[0]?.rawValue || 0) }}
        </p>
        <div class="hero-rule"></div>
      </div>

      <!-- 次级指标 + 操作 -->
      <div v-if="accountRows.length > 0" class="dashboard__sub-row">
        <div class="sub-kpis">
          <div v-for="card in groupSummaryCards.slice(1)" :key="card.label" class="sub-kpi">
            <span class="sub-kpi__value display-number">{{ formatLargeNum(card.rawValue) }}</span>
            <span class="sub-kpi__label">{{ card.label }}</span>
          </div>
        </div>
        <div class="sub-actions">
          <el-radio-group v-model="period" size="small" @change="onPeriodChange">
            <el-radio-button value="day">日</el-radio-button>
            <el-radio-button value="week">周</el-radio-button>
          </el-radio-group>
          <el-button :icon="Refresh" size="small" circle :loading="loading" @click="refreshAll" />
        </div>
      </div>

      <!-- 时间维度对比卡片 -->
      <div v-if="accountRows.length > 0" class="dashboard__time-cards">
        <StatCard
          v-for="(card, idx) in timeComparisonCards"
          :key="card.label"
          :label="card.label"
          :value="card.rawValue"
          :formatter="formatLargeNum"
          :trend="card.trend"
          :trend-label="card.label.startsWith('本周') ? '较上周' : '较上月'"
          :accent-color="card.color"
          :animated="false"
          :delay="idx * 80"
        />
      </div>

      <!-- 分组切换 -->
      <div v-if="accountGroups.length > 0" class="dashboard__groups">
        <el-select
          v-model="selectedGroup"
          size="small"
          style="width: 120px"
          @change="onGroupChange"
        >
          <el-option label="全部" value="all" />
          <el-option v-for="g in accountGroups" :key="g.name" :label="g.name" :value="g.name" />
        </el-select>
      </div>

      <!-- 图表区 -->
      <div v-if="accountRows.length > 0" class="dashboard__charts">
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
      <div v-if="accountRows.length > 0" class="dashboard__accounts">
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
      <div v-if="accountRows.length === 0 && !loading" class="dashboard__empty">
        <div class="empty-state">
          <div class="empty-state__icon">
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
              <rect
                x="8"
                y="12"
                width="56"
                height="48"
                rx="8"
                stroke="#c7ff45"
                stroke-width="1"
                opacity="0.3"
              />
              <circle
                cx="36"
                cy="36"
                r="14"
                stroke="#c7ff45"
                stroke-width="1"
                opacity="0.15"
                stroke-dasharray="4 4"
              />
              <circle cx="36" cy="36" r="5" fill="#c7ff45" opacity="0.4" />
            </svg>
          </div>
          <h3 class="empty-state__title">连接你的第一个账号</h3>
          <p class="empty-state__desc">绑定社交媒体账号，开始矩阵管理与数据分析</p>
          <el-button type="primary" size="large" @click="$router.push('/accounts')"
            >添加账号</el-button
          >
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { Refresh, ArrowRight } from '@element-plus/icons-vue'
import DataChart from '@/components/common/DataChart.vue'
import PlatformBadge from '@/components/common/PlatformBadge.vue'
import StatCard from '@/components/common/StatCard.vue'
import { useDashboard } from '@/composables/useDashboard'
import { formatLargeNum } from '@/utils/format'

const {
  period,
  loading,
  trendDays,
  selectedGroup,
  lastUpdate,
  accountRows,
  accountGroups,
  displayAccounts,
  groupSummaryCards,
  timeComparisonCards,
  refreshAll,
  loadFollowerTrend,
  onPeriodChange,
  onGroupChange,
  followerChartOption,
  platformChartOption,
} = useDashboard()
</script>

<style lang="scss" scoped>
.dashboard {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: $space-xl;
  min-height: 100%;

  &__hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: $space-2xl 0 $space-lg;
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
    grid-template-columns: repeat(2, 1fr);
    gap: $space-md;
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

  &__skeleton {
    // Skeleton mimics the real layout for smooth transition
    display: flex;
    flex-direction: column;
    gap: $section-gap;
    position: relative;
    z-index: 1;
    padding-bottom: $space-2xl;

    .dashboard__hero,
    .dashboard__sub-row,
    .dashboard__time-cards,
    .dashboard__charts,
    .dashboard__accounts {
      opacity: 0.7;
    }
  }
  &__skeleton-row {
    display: flex;
    gap: $space-xs;
    align-items: center;
    margin-bottom: $space-md;
  }
}

// Command center
.dashboard__command {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(360px, 0.8fr);
  gap: $space-xl;
  align-items: stretch;
  min-height: 310px;
  padding: clamp(28px, 4vw, 52px);
  border: 1px solid rgba($color-accent, 0.22);
  border-radius: $radius-xl;
  background:
    radial-gradient(circle at 10% 12%, rgba($color-accent, 0.2), transparent 28%),
    radial-gradient(circle at 84% 18%, rgba($color-accent-alt, 0.14), transparent 26%),
    linear-gradient(135deg, rgba(243, 240, 223, 0.08), rgba(243, 240, 223, 0.018)),
    rgba(8, 11, 8, 0.84);
  box-shadow: $shadow-lg;
  overflow: hidden;
  position: relative;
  z-index: 1;

  &::before {
    content: '';
    position: absolute;
    inset: 18px;
    border: 1px solid rgba(243, 240, 223, 0.06);
    border-radius: 24px;
    pointer-events: none;
  }

  &::after {
    content: '';
    position: absolute;
    right: -8%;
    bottom: -42%;
    width: 430px;
    height: 430px;
    border: 1px solid rgba($color-accent, 0.18);
    border-radius: 50%;
    box-shadow:
      inset 0 0 80px rgba($color-accent, 0.06),
      0 0 90px rgba($color-accent-alt, 0.06);
    pointer-events: none;
  }
}

.command-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: $space-md;
  position: relative;
  z-index: 1;

  h1 {
    max-width: 760px;
    font-size: clamp(34px, 4.3vw, 58px);
    line-height: 0.98;
    letter-spacing: -0.065em;
    margin: 0;
  }

  p {
    max-width: 620px;
    color: $color-text-secondary;
    font-size: 16px;
    margin: 0;
  }
}

.command-meta {
  display: flex;
  flex-wrap: wrap;
  gap: $space-xs;
  margin-top: $space-xs;

  span {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 4px 10px;
    border: 1px solid rgba(243, 240, 223, 0.1);
    border-radius: $radius-full;
    background: rgba(5, 7, 5, 0.42);
    color: $color-text-secondary;
    font-size: $text-micro;
    font-weight: 760;
  }
}

.command-actions {
  display: grid;
  gap: $space-sm;
  position: relative;
  z-index: 1;
}

.command-action {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  min-height: 82px;
  padding: 18px 20px;
  border-radius: $radius-lg;
  border: 1px solid rgba(243, 240, 223, 0.1);
  background:
    linear-gradient(135deg, rgba(243, 240, 223, 0.055), rgba(243, 240, 223, 0.016)),
    rgba(5, 7, 5, 0.48);
  color: $color-text-primary;
  transition: all 0.22s $ease-out;

  &:hover {
    border-color: $color-border-hover;
    background: rgba($color-accent, 0.08);
    transform: translateX(4px);
  }

  &--primary {
    color: #071008;
    border-color: rgba($color-accent, 0.68);
    background: linear-gradient(135deg, $color-accent, #90f35b);
    box-shadow: 0 18px 44px rgba($color-accent, 0.16);

    .command-action__hint {
      color: rgba(7, 16, 8, 0.72);
    }
  }

  &__label {
    font-size: 16px;
    font-weight: 860;
  }

  &__hint {
    font-size: $text-caption;
    color: $color-text-tertiary;
  }
}

.dashboard__runway {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: $space-md;
  position: relative;
  z-index: 1;
}

.runway-step {
  display: flex;
  align-items: center;
  gap: $space-sm;
  padding: 18px 20px;
  border: 1px solid rgba(243, 240, 223, 0.09);
  border-radius: $radius-lg;
  background:
    linear-gradient(135deg, rgba(243, 240, 223, 0.045), transparent), rgba(13, 19, 15, 0.72);

  &__index {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: rgba(243, 240, 223, 0.08);
    color: $color-text-tertiary;
    font-family: $font-mono;
    font-size: $text-caption;
  }

  strong {
    display: block;
    color: $color-text-primary;
    font-size: 14px;
    margin-bottom: 2px;
  }

  span {
    color: $color-text-tertiary;
    font-size: $text-caption;
  }

  &--done .runway-step__index {
    background: rgba($color-success, 0.16);
    color: $color-success;
  }

  &--ready .runway-step__index {
    background: rgba($color-accent, 0.16);
    color: $color-accent;
  }
}

.dashboard__capabilities {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: $space-md;
  position: relative;
  z-index: 1;
}

.capability-card {
  min-height: 154px;
  padding: 22px;
  border: 1px solid rgba(243, 240, 223, 0.09);
  border-radius: $radius-lg;
  background:
    linear-gradient(145deg, rgba(243, 240, 223, 0.05), rgba(243, 240, 223, 0.012)),
    rgba(13, 19, 15, 0.74);
  color: $color-text-primary;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: $shadow-sm;
  transition: all 0.24s $ease-out;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    height: 3px;
    background: linear-gradient(90deg, $color-accent, transparent);
    opacity: 0;
    transition: opacity 0.24s $ease-out;
  }

  &:hover {
    border-color: $color-border-hover;
    background: rgba(29, 43, 34, 0.82);
    transform: translateY(-4px);
    box-shadow: $shadow-md;

    &::before {
      opacity: 1;
    }
  }

  &__tag {
    color: $color-accent;
    font-size: $text-micro;
    font-weight: 860;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  strong {
    font-size: 20px;
    letter-spacing: -0.035em;
  }

  span:last-child {
    color: $color-text-tertiary;
    font-size: $text-caption;
    line-height: 1.5;
  }
}

// Hero
.hero-label {
  font-size: 12px;
  color: $color-accent;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-weight: 860;
  margin-bottom: $space-sm;
}
.hero-value {
  font-size: clamp(54px, 8vw, 112px);
  font-weight: 860;
  letter-spacing: -0.08em;
  line-height: 1;
  color: $color-accent;
  text-shadow: 0 0 32px rgba($color-accent, 0.18);
}
.hero-rule {
  width: 90px;
  height: 3px;
  background: linear-gradient(90deg, transparent, $color-accent, transparent);
  margin-top: 20px;
  border-radius: $radius-full;
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
    color: $color-accent;
    font-weight: 500;
  }
  &__link {
    font-size: 13px;
    color: $color-text-tertiary;
    text-decoration: none;
    margin-left: auto;
    transition: color 0.2s;
    &:hover {
      color: $color-accent;
    }
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
    border-color: rgba($color-accent, 0.24);
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
  &:hover &__arrow {
    opacity: 1;
    color: $color-accent;
  }
}

// Empty state
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  text-align: center;
  &__icon {
    opacity: 0.7;
  }
  &__title {
    font-family: $font-heading;
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

@media (max-width: 1023px) {
  .dashboard__command {
    grid-template-columns: 1fr;
  }

  .dashboard__runway {
    grid-template-columns: 1fr;
  }

  .dashboard__capabilities {
    grid-template-columns: 1fr;
  }
}
</style>
