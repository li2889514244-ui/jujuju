<template>
  <div
    class="card"
    :class="[
      `card--${variant}`,
      `card--${padding}`,
      { 'card--hover': hoverable, 'card--interactive': interactive },
    ]"
    @click="interactive ? $emit('click', $event) : undefined"
  >
    <div v-if="$slots.header || title" class="card__header">
      <slot name="header">
        <span class="card__title">{{ title }}</span>
      </slot>
    </div>
    <div class="card__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
  variant?: 'default' | 'flat' | 'subtle'
  padding?: 'sm' | 'md' | 'lg'
  hoverable?: boolean
  interactive?: boolean
}>()

defineEmits<{ click: [e: MouseEvent] }>()
</script>

<style lang="scss" scoped>
@import '@/assets/styles/variables';

.card {
  border-radius: $radius-lg;
  transition: all 0.2s $ease-out;

  &--default {
    background: $color-bg-elevated;
    border: 1px solid $color-border;
    box-shadow: $shadow-sm;
  }
  &--flat {
    background: $color-bg-secondary;
    border: 1px solid $color-border;
  }
  &--subtle {
    background: rgba(59, 130, 246, 0.03);
    border: 1px solid rgba(59, 130, 246, 0.06);
  }

  &--sm {
    padding: $space-sm;
  }
  &--md {
    padding: $space-lg;
  }
  &--lg {
    padding: $space-xl;
  }

  &--hover:hover {
    border-color: $color-border-hover;
    box-shadow: $shadow-md;
  }
  &--interactive {
    cursor: pointer;
    &:active {
      transform: scale(0.985);
    }
  }

  &__header {
    padding-bottom: 14px;
    margin-bottom: 14px;
    border-bottom: 1px solid $color-border;
  }
  &__title {
    font-size: $text-body;
    font-weight: 600;
    color: $color-text-primary;
  }
}
</style>
