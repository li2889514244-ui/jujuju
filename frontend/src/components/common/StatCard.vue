<template>
  <div class="stat-card" :class="{ 'stat-card--lg': size === 'lg' }">
    <div class="stat-card__accent" :style="{ background: accentColor }" />
    <div class="stat-card__content">
      <span class="stat-card__label">{{ label }}</span>
      <div class="stat-card__value-row">
        <AnimatedNumber
          v-if="animated"
          :value="value"
          :format="formatter"
          :delay="delay"
          class="stat-card__value"
        />
        <span v-else class="stat-card__value">{{ displayValue }}</span>
      </div>
      <div
        v-if="trend !== null && trend !== undefined"
        class="stat-card__trend"
        :class="{ 'stat-card__trend--up': trend > 0, 'stat-card__trend--down': trend < 0 }"
      >
        <el-icon :size="12">
          <CaretTop v-if="trend > 0" />
          <CaretBottom v-else-if="trend < 0" />
          <Minus v-else />
        </el-icon>
        {{ Math.abs(trend) }}% {{ trendLabel }}
      </div>
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
    accentColor?: string
    animated?: boolean
    delay?: number
    size?: 'md' | 'lg'
  }>(),
  {
    trend: null,
    trendLabel: '较上周',
    accentColor: '#00cc99',
    animated: true,
    delay: 0,
    size: 'md',
  },
)

const displayValue = computed(() =>
  props.formatter ? props.formatter(props.value) : props.value.toLocaleString(),
)
</script>

<style lang="scss" scoped>
@import '@/assets/styles/variables';

.stat-card {
  position: relative;
  overflow: hidden;
  background: $color-bg-elevated;
  border: 1px solid $color-border;
  border-radius: $radius-lg;
  padding: $space-lg;
  transition: border-color 0.2s;
  &:hover {
    border-color: $color-border-hover;
  }

  &__accent {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
  }

  &__content {
    position: relative;
    z-index: 1;
  }

  &__label {
    font-size: $text-caption;
    color: $color-text-tertiary;
    margin-bottom: $space-xs;
    display: block;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
  }

  &__value {
    font-size: 32px;
    font-weight: 700;
    color: $color-text-primary;
    letter-spacing: -0.03em;
    line-height: 1.1;
    font-feature-settings: 'tnum';
    font-variant-numeric: tabular-nums;
    font-family: $font-mono;
  }

  &--lg &__value {
    font-size: 48px;
  }

  &__trend {
    font-size: $text-micro;
    font-weight: 500;
    margin-top: $space-sm;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 8px;
    border-radius: $radius-full;
    background: rgba(34, 197, 94, 0.1);
    color: $color-success;

    &--down {
      background: rgba(239, 68, 68, 0.1);
      color: $color-danger;
    }
  }

  &__chart {
    margin-top: $space-sm;
  }
}
</style>
