<template>
  <span class="animated-number">{{ displayValue }}</span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useTransition, TransitionPresets } from '@vueuse/core'

const props = withDefaults(
  defineProps<{
    value: number
    format?: (n: number) => string
    duration?: number
    delay?: number
  }>(),
  {
    duration: 800,
    delay: 0,
  },
)

const target = ref(0)
const animated = useTransition(target, {
  duration: props.duration,
  delay: props.delay,
  transition: TransitionPresets.easeOutExpo,
})

watch(
  () => props.value,
  (v) => {
    const ms = props.delay || 0
    if (ms > 0) {
      setTimeout(() => {
        target.value = v
      }, ms)
    } else {
      target.value = v
    }
  },
  { immediate: true },
)

const displayValue = computed(() => {
  const n = Math.round(animated.value)
  return props.format ? props.format(n) : n.toLocaleString()
})
</script>

<style lang="scss" scoped>
.animated-number {
  font-family: $font-mono;
  font-feature-settings:
    'tnum' 1,
    'cv11' 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
</style>
