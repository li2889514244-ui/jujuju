<template>
  <span class="platform-badge" :class="`platform-badge--${size}`" :style="{ '--p-color': platformColor }">
    <span class="platform-badge__dot" />
    <span class="platform-badge__label">{{ platformLabel }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getPlatformColor, getPlatformLabel } from '@/composables/usePlatform'

const props = withDefaults(defineProps<{
  platform: string
  size?: 'sm' | 'md'
}>(), { size: 'sm' })

const platformColor = computed(() => getPlatformColor(props.platform))
const platformLabel = computed(() => getPlatformLabel(props.platform))
</script>

<style lang="scss" scoped>
.platform-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: $radius-full;
  background: rgba(255, 255, 255, 0.06);
  font-weight: 500;

  &__dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--p-color);
    flex-shrink: 0;
  }

  &__label {
    font-size: 12px;
    color: #98989d;
  }

  &--md {
    padding: 4px 12px;
    .platform-badge__label { font-size: 13px; }
  }
}
</style>
