<template>
  <GlassCard :padding="size === 'lg' ? 'lg' : 'md'" class="stat-card">
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
  </GlassCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CaretTop, CaretBottom, Minus } from '@element-plus/icons-vue'
import GlassCard from './GlassCard.vue'
import AnimatedNumber from './AnimatedNumber.vue'

const props = withDefaults(defineProps<{
  label: string
  value: number
  formatter?: (n: number) => string
  trend?: number | null
  trendLabel?: string
  accentColor?: string
  animated?: boolean
  delay?: number
  size?: 'md' | 'lg'
}>(), {
  trend: null,
  trendLabel: '较上周',
  accentColor: '#0a84ff',
  animated: true,
  delay: 0,
  size: 'md',
})

const displayValue = computed(() =>
  props.formatter ? props.formatter(props.value) : props.value.toLocaleString()
)
</script>

<style lang="scss" scoped>
.stat-card {
  position: relative;
  overflow: hidden;

  &__accent {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    border-radius: $radius-lg $radius-lg 0 0;
  }

  &__content {
    position: relative; z-index: 1;
  }

  &__label {
    font-size: 13px;
    color: #6e6e73;
    margin-bottom: 6px;
    display: block;
  }

  &__value {
    font-size: 28px;
    font-weight: 700;
    color: #f5f5f7;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  &__trend {
    font-size: 12px;
    font-weight: 500;
    margin-top: 8px;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px 8px;
    border-radius: $radius-full;
    background: rgba(#30d158, 0.1);
    color: #30d158;
    transition: all 0.25s ease;

    &--down {
      background: rgba(#ff453a, 0.1);
      color: #ff453a;
    }
  }

  &__chart {
    margin-top: 12px;
  }
}
</style>
