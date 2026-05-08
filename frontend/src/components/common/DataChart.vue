<template>
  <div ref="chartRef" class="data-chart" :style="{ height: height + 'px' }" role="img" aria-label="数据图表"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, shallowRef } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, RadarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  RadarComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsOption } from 'echarts'

// Register only the components/charts we actually use
echarts.use([
  BarChart,
  LineChart,
  PieChart,
  RadarChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  RadarComponent,
  CanvasRenderer,
])

const props = withDefaults(
  defineProps<{
    option: EChartsOption
    height?: number
    autoResize?: boolean
  }>(),
  { height: 400, autoResize: true }
)

const chartRef = ref<HTMLElement>()
const chartInstance = shallowRef<echarts.ECharts>()
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (chartRef.value) {
    chartInstance.value = echarts.init(chartRef.value)
    chartInstance.value.setOption(props.option)

    if (props.autoResize) {
      resizeObserver = new ResizeObserver(() => {
        chartInstance.value?.resize()
      })
      resizeObserver.observe(chartRef.value)
    }
  }
})

watch(
  () => props.option,
  (newOption) => {
    chartInstance.value?.setOption(newOption, true)
  },
  { deep: true }
)

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  chartInstance.value?.dispose()
})

function getChart() {
  return chartInstance.value
}

defineExpose({ getChart })
</script>

<style lang="scss" scoped>
.data-chart {
  width: 100%;
}
</style>
