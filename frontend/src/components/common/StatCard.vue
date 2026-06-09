<template>
  <div class="stat-card" :class="[`stat-card--${size}`, { 'stat-card--glow': glow }]">
    <div v-if="accentColor" class="stat-card__edge" :style="{ background: accentColor }" />
    <div class="stat-card__body">
      <div class="stat-card__head">
        <span class="stat-card__label">{{ label }}</span>
        <el-icon v-if="$slots.icon" class="stat-card__icon" :size="14">
          <slot name="icon" />
        </el-icon>
      </div>

      <div class="stat-card__value-row">
        <AnimatedNumber
          v-if="animated"
          :value="value"
          :format="formatter"
          :delay="delay"
          class="stat-card__value"
        />
        <span v-else class="stat-card__value">{{ displayValue }}</span>
        <span v-if="suffix" class="stat-card__suffix">{{ suffix }}</span>
      </div>

      <div
        v-if="trend !== null && trend !== undefined"
        class="stat-card__trend"
        :class="{
          'stat-card__trend--up': trend > 0,
          'stat-card__trend--down': trend < 0,
        }"
      >
        <el-icon :size="11">
          <CaretTop v-if="trend > 0" />
          <CaretBottom v-else-if="trend < 0" />
          <Minus v-else />
        </el-icon>
        <span class="stat-card__trend-pct">{{ Math.abs(trend) }}%</span>
        <span class="stat-card__trend-text">{{ trendLabel }}</span>
      </div>

      <div v-else-if="caption" class="stat-card__caption">{{ caption }}</div>
    </div>

    <div v-if="$slots.chart" class="stat-card__chart">
      <slot name="chart" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CaretTop, CaretBottom, Minus } from '@element-plus/icons-vue'
import AnimatedNumber from './AnimatedNumber.vue'

const props = withDefaults(
  defineProps<{
    label: string
    value: number
    formatter?: (n: number) => string
    trend?: number | null
    trendLabel?: string
    caption?: string
    accentColor?: string
    suffix?: string
    animated?: boolean
    delay?: number
    size?: 'sm' | 'md' | 'lg'
    glow?: boolean
  }>(),
  {
    trend: null,
    trendLabel: '较上周',
    caption: '',
    accentColor: '',
    suffix: '',
    animated: true,
    delay: 0,
    size: 'md',
    glow: false,
  },
)

const displayValue = computed(() =>
  props.formatter ? props.formatter(props.value) : props.value.toLocaleString(),
)
</script>

<style lang="scss" scoped>
.stat-card {
  position: relative;
  overflow: hidden;
  background: $bg-elevated;
  border: 1px solid $border-base;
  border-radius: $radius-lg;
  padding: $space-5;
  transition:
    transform 0.25s $ease-out,
    border-color 0.2s $ease-out,
    box-shadow 0.25s $ease-out,
    background 0.2s $ease-out;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(120% 80% at 100% 0%, rgba(99, 102, 241, 0.08) 0%, transparent 55%);
    opacity: 0;
    transition: opacity 0.3s $ease-out;
    pointer-events: none;
  }

  &:hover {
    transform: translateY(-2px);
    border-color: $border-strong;
    box-shadow: $shadow-md;

    &::before {
      opacity: 1;
    }
  }

  &--glow {
    box-shadow:
      $shadow-sm,
      0 0 0 1px rgba(99, 102, 241, 0.12),
      0 8px 24px rgba(99, 102, 241, 0.08);

    &:hover {
      box-shadow:
        $shadow-md,
        0 0 0 1px rgba(99, 102, 241, 0.2),
        0 12px 32px rgba(99, 102, 241, 0.14);
    }
  }

  &--sm {
    padding: $space-4;
    .stat-card__value {
      font-size: 24px;
    }
  }

  &--lg {
    padding: $space-6;
    .stat-card__value {
      font-size: 44px;
    }
  }

  &__edge {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    opacity: 0.85;
  }

  &__body {
    position: relative;
    z-index: 1;
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $space-3;
  }

  &__label {
    font-size: $text-xs;
    color: $text-tertiary;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
  }

  &__icon {
    color: $text-tertiary;
  }

  &__value-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  &__value {
    font-size: 32px;
    font-weight: 600;
    color: $text-primary;
    letter-spacing: -0.025em;
    line-height: 1.1;
    font-family: $font-mono;
    font-feature-settings:
      'tnum' 1,
      'cv11' 1;
    font-variant-numeric: tabular-nums;
  }

  &__suffix {
    font-size: $text-sm;
    color: $text-tertiary;
    font-weight: 500;
  }

  &__trend {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: $space-3;
    padding: 3px 8px;
    border-radius: $radius-full;
    font-size: $text-micro;
    font-weight: 500;
    background: rgba(16, 185, 129, 0.1);
    color: $color-success;

    &--down {
      background: rgba(239, 68, 68, 0.1);
      color: $color-danger;
    }
  }

  &__trend-pct {
    font-family: $font-mono;
    font-weight: 600;
  }

  &__trend-text {
    color: $text-tertiary;
    margin-left: 2px;
  }

  &__caption {
    margin-top: $space-3;
    font-size: $text-micro;
    color: $text-tertiary;
  }

  &__chart {
    position: relative;
    margin-top: $space-4;
    margin-inline: -$space-2;
  }
}
</style>
