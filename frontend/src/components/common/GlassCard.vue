<template>
  <div
    class="glass-card"
    :class="[
      `glass-card--${variant}`,
      `glass-card--${padding}`,
      { 'glass-card--hover': hoverable, 'glass-card--interactive': interactive },
    ]"
    @click="interactive ? $emit('click', $event) : undefined"
  >
    <div v-if="$slots.header || title" class="glass-card__header">
      <slot name="header">
        <span class="glass-card__title">{{ title }}</span>
      </slot>
    </div>
    <div class="glass-card__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  variant?: 'default' | 'elevated' | 'tinted'
  padding?: 'sm' | 'md' | 'lg'
  hoverable?: boolean
  interactive?: boolean
}>()

defineEmits<{ click: [e: MouseEvent] }>()
</script>

<style lang="scss" scoped>
.glass-card {
  border-radius: $radius-lg;
  border: 1px solid $color-border;
  transition: all 0.3s $ease-out;

  &--default {
    @include panel;
  }
  &--elevated {
    background: $color-bg-elevated;
    border-color: $color-border;
    box-shadow: $shadow-md;
  }
  &--tinted {
    background: rgba(212, 155, 80, 0.04);
    border-color: rgba(212, 155, 80, 0.1);
    .glass-card__header {
      border-bottom-color: rgba(212, 155, 80, 0.06);
    }
  }

  &--sm { padding: $space-sm; }
  &--md { padding: $space-lg; }
  &--lg { padding: $space-xl; }

  &--hover:hover {
    border-color: rgba(212, 155, 80, 0.15);
    box-shadow: $shadow-md;
  }

  &--interactive {
    cursor: pointer;
    &:active { transform: scale(0.98); }
  }

  &__header {
    padding-bottom: 12px;
    margin-bottom: 12px;
    border-bottom: 1px solid $color-border;
  }

  &__title {
    font-size: $text-body;
    font-weight: 500;
    color: $color-text-secondary;
  }

  &__body {
    // slot content
  }
}
</style>
