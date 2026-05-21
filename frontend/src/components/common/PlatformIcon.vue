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
import { PLATFORM_LABELS } from '@/types'
import { toFrontend } from '@/utils/platform'
import { getPlatformColor, getPlatformChar } from '@/composables/usePlatform'

const props = withDefaults(
  defineProps<{
    platform: string
    showLabel?: boolean
    size?: 'small' | 'default' | 'large' | number
  }>(),
  { showLabel: false, size: 'default' },
)

const normalizedPlatform = computed(() => toFrontend(props.platform) as string)

const platformColor = computed(() => getPlatformColor(normalizedPlatform.value))
const platformChar = computed(() => getPlatformChar(normalizedPlatform.value))
const platformLabel = computed(
  () => (PLATFORM_LABELS as Record<string, string>)[normalizedPlatform.value] || props.platform,
)

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
    font-size: $text-body;
    font-weight: 600;
    flex-shrink: 0;
  }

  &__label {
    font-size: $text-body;
    color: #1D1D1F;
  }
}
</style>
