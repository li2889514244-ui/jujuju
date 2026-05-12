<template>
  <div class="mini-trend" ref="chartRef"></div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{
  data: number[]
  color?: string
  height?: number
}>()

const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

function render() {
  if (!chartRef.value || !props.data.length) return
  if (!chart) {
    chart = echarts.init(chartRef.value)
  }
  const isUp = props.data[props.data.length - 1] >= props.data[0]
  const lineColor = props.color || (isUp ? '#67c23a' : '#f56c6c')
  chart.setOption({
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { show: false, type: 'category', data: props.data.map((_, i) => i) },
    yAxis: { show: false, type: 'value' },
    series: [{
      type: 'line',
      data: props.data,
      smooth: true,
      symbol: 'none',
      lineStyle: { width: 2, color: lineColor },
      areaStyle: { color: lineColor, opacity: 0.1 },
    }],
  })
}

watch(() => props.data, render, { deep: true })

onMounted(() => {
  render()
})

onBeforeUnmount(() => {
  chart?.dispose()
})
</script>

<style scoped>
.mini-trend {
  width: 120px;
  height: v-bind("(props.height || 36) + 'px'");
}
</style>
