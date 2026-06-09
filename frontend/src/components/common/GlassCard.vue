<template>
  <div
    class="card"
    :class="[
      `card--${variant}`,
      `card--pad-${padding}`,
      { 'card--hover': hoverable, 'card--interactive': interactive },
    ]"
    @click="interactive ? $emit('click', $event) : undefined"
  >
    <div v-if="hasHeader" class="card__header">
      <slot name="header">
        <div class="card__header-text">
          <span v-if="eyebrow" class="card__eyebrow">{{ eyebrow }}</span>
          <span class="card__title">{{ title }}</span>
        </div>
      </slot>
      <div v-if="$slots.aside" class="card__aside">
        <slot name="aside" />
      </div>
    </div>
    <div class="card__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = defineProps<{
  title?: string
  eyebrow?: string
  variant?: 'default' | 'flat' | 'subtle' | 'glass'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hoverable?: boolean
  interactive?: boolean
}>()

defineEmits<{ click: [e: MouseEvent] }>()

const slots = useSlots()
const hasHeader = computed(() => !!slots.header || !!props.title)
</script>

<style lang="scss" scoped>
.card {
  position: relative;
  border-radius: $radius-lg;
  transition:
    transform 0.25s $ease-out,
    border-color 0.2s $ease-out,
    box-shadow 0.25s $ease-out,
    background 0.2s $ease-out;

  // variants
  &--default {
    background: $bg-elevated;
    border: 1px solid $border-base;
    box-shadow: $shadow-sm;
  }

  &--flat {
    background: rgba(255, 255, 255, 0.015);
    border: 1px solid $border-subtle;
  }

  &--subtle {
    background: rgba(99, 102, 241, 0.04);
    border: 1px solid rgba(99, 102, 241, 0.1);
  }

  &--glass {
    @include glass;
    box-shadow: $shadow-sm;
  }

  // padding
  &--pad-none {
    .card__header,
    .card__body {
      padding: 0;
    }
  }

  &--pad-sm {
    .card__header,
    .card__body {
      padding: $space-4;
    }
  }

  &--pad-md {
    .card__header,
    .card__body {
      padding: $space-5;
    }
  }

  &--pad-lg {
    .card__header,
    .card__body {
      padding: $space-6;
    }
  }

  // modifiers
  &--hover:hover {
    transform: translateY(-2px);
    border-color: $border-strong;
    box-shadow: $shadow-md;
  }

  &--interactive {
    cursor: pointer;
    user-select: none;
    &:active {
      transform: scale(0.99);
    }
  }

  // header
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $space-3;
    padding-bottom: $space-4;
    margin-bottom: $space-4;
    border-bottom: 1px solid $border-subtle;
  }

  &__header-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__eyebrow {
    font-size: $text-micro;
    color: $text-tertiary;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
  }

  &__title {
    font-size: $text-h3;
    font-weight: 600;
    color: $text-primary;
    letter-spacing: -0.01em;
  }

  &__aside {
    flex-shrink: 0;
  }
}
</style>
