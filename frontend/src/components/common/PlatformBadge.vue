<template>
  <span
    class="platform-badge"
    :class="[`platform-badge--${size}`, { 'platform-badge--solid': solid }]"
    :style="cssVars"
  >
    <span class="platform-badge__dot" />
    <span class="platform-badge__label">{{ platformLabel }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getPlatformColor, getPlatformLabel } from '@/composables/usePlatform'

const props = withDefaults(
  defineProps<{
    platform: string
    size?: 'sm' | 'md'
    solid?: boolean
  }>(),
  { size: 'sm', solid: false },
)

const platformColor = computed(() => getPlatformColor(props.platform))
const platformLabel = computed(() => getPlatformLabel(props.platform))

const cssVars = computed(() => ({
  '--p-color': platformColor.value,
  '--p-color-soft': `${platformColor.value}1f`, // 12% alpha
}))
</script>

<style lang="scss" scoped>
.platform-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: $radius-full;
  background: var(--p-color-soft);
  border: 1px solid transparent;
  font-weight: 500;
  font-feature-settings: 'tnum' 1;
  font-variant-numeric: tabular-nums;
  transition: background 0.15s $ease-out;

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--p-color);
    flex-shrink: 0;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.04);
  }

  &__label {
    font-size: $text-xs;
    color: $text-secondary;
    line-height: 1.4;
  }

  &--md {
    padding: 4px 12px;
    gap: 7px;

    .platform-badge__dot {
      width: 7px;
      height: 7px;
    }
    .platform-badge__label {
      font-size: 13px;
    }
  }

  &--solid {
    background: var(--p-color);
    border-color: var(--p-color);

    .platform-badge__dot {
      background: rgba(255, 255, 255, 0.85);
      box-shadow: none;
    }
    .platform-badge__label {
      color: #0a0b14;
      font-weight: 600;
    }
  }
}
</style>
