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
  border: 1px solid var(--app-border);
  transition: all 0.35s $ease-spring;

  &--default {
    @include glass;
  }
  &--elevated {
    @include glass-heavy;
    box-shadow: var(--app-shadow-md);
  }
  &--tinted {
    background: rgba(#0a84ff, 0.06);
    border-color: rgba(#0a84ff, 0.15);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    .glass-card__header {
      border-bottom-color: rgba(#0a84ff, 0.08);
    }
  }

  &--sm {
    padding: 14px;
  }
  &--md {
    padding: 20px;
  }
  &--lg {
    padding: 28px;
  }

  &--hover:hover {
    transform: translateY(-2px);
    box-shadow: var(--app-shadow-md);
    border-color: var(--app-border-strong);
  }

  &--interactive {
    cursor: pointer;
    &:active {
      transform: scale(0.98);
    }
  }

  &__header {
    padding-bottom: 12px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--app-separator);
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--app-text-secondary);
    letter-spacing: -0.01em;
  }

  &__body {
    // slot content
  }
}
</style>
