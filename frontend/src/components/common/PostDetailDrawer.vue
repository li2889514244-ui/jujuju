<template>
  <el-drawer
    v-model="visible"
    title="作品详情"
    direction="rtl"
    size="560px"
    :before-close="handleClose"
    custom-class="post-detail-drawer"
  >
    <template v-if="post">
      <!-- 头部：标题 + 平台标签 + 发布时间 -->
      <div class="detail-header">
        <h2 class="detail-header__title">{{ post.title || '无标题' }}</h2>
        <div class="detail-header__meta">
          <el-tag size="small" type="warning">{{ PLATFORM_LABELS[post.platform as keyof typeof PLATFORM_LABELS] || post.platform }}</el-tag>
          <span class="detail-header__time">{{ formatTime(post.publishAt || post.createdAt) }}</span>
        </div>
        <el-divider style="margin: 16px 0" />
      </div>

      <!-- 第一区：核心指标 3x5 网格 (views, likes, comments, shares, saves, danmaku, dislikes, followsFromPost) -->
      <div class="detail-section">
        <h3 class="detail-section__title">互动指标</h3>
        <div class="metric-grid">
          <div class="metric-item">
            <span class="metric-item__label">播放量</span>
            <span class="metric-item__value">{{ formatNum(post.views) }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-item__label">点赞</span>
            <span class="metric-item__value">{{ formatNum(post.likes) }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-item__label">评论</span>
            <span class="metric-item__value">{{ formatNum(post.comments) }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-item__label">分享</span>
            <span class="metric-item__value">{{ formatNum(post.shares) }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-item__label">收藏</span>
            <span class="metric-item__value">{{ formatNum(post.saves) }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-item__label">弹幕</span>
            <span class="metric-item__value">{{ formatNum(post.danmakuCount) }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-item__label">踩</span>
            <span class="metric-item__value">{{ formatNum(post.dislikes) }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-item__label">从作品关注</span>
            <span class="metric-item__value">{{ formatNum(post.followsFromPost) }}</span>
          </div>
          <div class="metric-item metric-item--highlight">
            <span class="metric-item__label">互动率</span>
            <span class="metric-item__value">{{ formatPercent(post.engagementRate) }}</span>
          </div>
        </div>
      </div>

      <!-- 第二区：播放质量 (completionRate, fiveSecCompletionRate, coverClickRate, avgPlayDuration) -->
      <div class="detail-section">
        <h3 class="detail-section__title">播放质量</h3>
        <div class="metric-grid metric-grid--4col">
          <div class="metric-item">
            <span class="metric-item__label">完播率</span>
            <span class="metric-item__value">{{ formatPercent(post.completionRate) }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-item__label">5 秒完播</span>
            <span class="metric-item__value">{{ formatPercent(post.fiveSecCompletionRate) }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-item__label">封面点击率</span>
            <span class="metric-item__value">{{ formatPercent(post.coverClickRate) }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-item__label">平均播放时长</span>
            <span class="metric-item__value">{{ formatDuration(post.avgPlayDuration) }}</span>
          </div>
        </div>
      </div>

      <!-- 第三区：视频信息 -->
      <div class="detail-section">
        <h3 class="detail-section__title">视频信息</h3>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="视频时长">
            {{ formatDuration(post.videoDuration) }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </template>

    <template v-else>
      <el-empty description="暂无数据" />
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import dayjs from 'dayjs'
import type { PostWithStats } from '@/types'
import { PLATFORM_LABELS } from '@/types'

const visible = ref(false)
const post = ref<PostWithStats | null>(null)

function open(p: PostWithStats) {
  post.value = p
  visible.value = true
}

function handleClose() {
  visible.value = false
}

function formatTime(time: string) {
  return time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '-'
}

function formatNum(n: any): string {
  if (n == null || n === 0) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return Number(n).toLocaleString()
}

function formatPercent(v: any): string {
  if (v == null) return '-'
  return Number(v).toFixed(1) + '%'
}

function formatDuration(seconds: any): string {
  if (seconds == null) return '-'
  const s = Math.floor(Number(seconds))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

defineExpose({ open })
</script>

<style lang="scss" scoped>
.detail-header {
  &__title {
    font-size: $text-title;
    font-weight: 600;
    color: $color-text-primary;
    margin: 0 0 12px;
    line-height: 1.4;
  }
  &__meta {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  &__time {
    font-size: $text-caption;
    color: $color-text-tertiary;
  }
}

.detail-section {
  margin-bottom: $space-lg;

  &__title {
    font-size: 13px;
    font-weight: 500;
    color: $color-bronze;
    margin: 0 0 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;

  &--4col {
    grid-template-columns: repeat(4, 1fr);
  }
}

.metric-item {
  background: $color-bg-secondary;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  &--highlight {
    background: rgba($color-bronze, 0.08);
    border-color: rgba($color-bronze, 0.18);
  }

  &__label {
    font-size: $text-micro;
    color: $color-text-tertiary;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &__value {
    font-size: $text-headline;
    font-weight: 600;
    color: $color-text-primary;
    font-feature-settings: 'tnum';
    font-variant-numeric: tabular-nums;
  }
}
</style>

<style lang="scss">
// 全局样式覆盖 drawer 内部，不能 scoped
.post-detail-drawer {
  .el-drawer__header {
    padding: 20px 24px 0;
    margin-bottom: 0;
  }
  .el-drawer__body {
    padding: 0 24px 24px;
  }
}
</style>
