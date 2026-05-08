<template>
  <div class="platform-icon" :style="{ '--platform-color': platformColor }">
    <span class="platform-icon__char" :style="charStyle">
      {{ platformChar }}
    </span>
    <span v-if="showLabel" class="platform-icon__label">{{ platformLabel }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { PLATFORM_LABELS, type Platform } from '@/types'

const props = withDefaults(
  defineProps<{
    platform: Platform
    showLabel?: boolean
    size?: 'small' | 'default' | 'large' | number
  }>(),
  { showLabel: false, size: 'default' }
)

const platformColors: Record<Platform, string> = {
  douyin: '#000000',
  kuaishou: '#ff4906',
  xiaohongshu: '#ff2442',
  video_account: '#07c160',
  bilibili: '#fb7299',
  weibo: '#ff8200',
}

const platformChars: Record<Platform, string> = {
  douyin: '抖',
  kuaishou: '快',
  xiaohongshu: '红',
  video_account: '视',
  bilibili: 'B',
  weibo: '微',
}

const platformColor = computed(() => platformColors[props.platform] || '#909399')
const platformChar = computed(() => platformChars[props.platform] || '?')
const platformLabel = computed(() => PLATFORM_LABELS[props.platform] || props.platform)

const iconSize = computed(() => {
  if (typeof props.size === 'number') return `${props.size}px`
  const sizeMap: Record<string, string> = { small: '20px', default: '28px', large: '36px' }
  return sizeMap[props.size] || '28px'
})

const charStyle = computed(() => ({
  backgroundColor: platformColor.value,
  width: iconSize.value,
  height: iconSize.value,
}))
</script>

<style lang="scss" scoped>
.platform-icon {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &__char {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    flex-shrink: 0;
  }

  &__label {
    font-size: 14px;
    color: #303133;
  }
}
</style>
