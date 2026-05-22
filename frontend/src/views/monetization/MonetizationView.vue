<template>
  <div class="monetization">
    <!-- Filters -->
    <el-card shadow="hover" class="monetization__filter">
      <el-form :inline="true">
        <el-form-item label="时间范围">
          <el-select v-model="days" style="width: 140px" @change="refreshAll">
            <el-option label="近7天" :value="7" />
            <el-option label="近30天" :value="30" />
            <el-option label="近90天" :value="90" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="refreshAll" :loading="loading">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- KPI Cards -->
    <el-row :gutter="20" class="monetization__overview">
      <el-col :xs="12" :sm="8" :md="4" v-for="card in kpiCards" :key="card.label">
        <el-card shadow="hover" class="overview-card">
          <div class="overview-card__label">{{ card.label }}</div>
          <div class="overview-card__value">{{ card.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Trend Chart -->
    <el-card shadow="hover" class="monetization__chart">
      <template #header>
        <div class="chart-header">
          <span>变现趋势</span>
          <el-radio-group v-model="trendMetric" size="small">
            <el-radio-button value="revenue">收入</el-radio-button>
            <el-radio-button value="gmv">GMV</el-radio-button>
            <el-radio-button value="orders">订单</el-radio-button>
            <el-radio-button value="buyerCount">买家</el-radio-button>
            <el-radio-button value="commission">佣金</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <DataChart :option="trendChartOption" :height="360" />
    </el-card>

    <!-- Platform Breakdown -->
    <el-row :gutter="20" class="monetization__body">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>平台变现明细</template>
          <el-table :data="byPlatform" stripe>
            <template #empty>
              <el-empty description="暂无变现数据，伴侣将在下次采集时自动获取" />
            </template>
            <el-table-column label="平台" width="120">
              <template #default="{ row }">
                <PlatformIcon :platform="row.platform" show-label />
              </template>
            </el-table-column>
            <el-table-column label="收入" width="140">
              <template #default="{ row }">¥{{ formatNum(row.revenue) }}</template>
            </el-table-column>
            <el-table-column label="GMV" width="140">
              <template #default="{ row }">¥{{ formatNum(row.gmv) }}</template>
            </el-table-column>
            <el-table-column label="订单数" width="120">
              <template #default="{ row }">{{ formatNum(row.orders) }}</template>
            </el-table-column>
            <el-table-column label="买家" width="100">
              <template #default="{ row }">{{ formatNum(row.buyerCount) }}</template>
            </el-table-column>
            <el-table-column label="佣金" width="140">
              <template #default="{ row }">¥{{ formatNum(row.commission) }}</template>
            </el-table-column>
            <el-table-column label="客单价" width="100">
              <template #default="{ row }">¥{{ formatNum(row.avgOrderValue) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import DataChart from '@/components/common/DataChart.vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import { analyticsApi } from '@/api/analytics'
import { PLATFORM_LABELS } from '@/types'
import dayjs from 'dayjs'

const days = ref(30)
const loading = ref(false)
const trendMetric = ref('revenue')
const data = ref<any>(null)

const kpiCards = computed(() => {
  const d = data.value
  if (!d) return []
  return [
    { label: '累计收入', value: '¥' + formatNum(d.totalRevenue || 0) },
    { label: '总 GMV', value: '¥' + formatNum(d.totalGmv || 0) },
    { label: '总订单', value: formatNum(d.totalOrders || 0) },
    { label: '成交买家', value: formatNum(d.totalBuyerCount || 0) },
    { label: '客单价', value: '¥' + formatNum(d.totalAvgOrderValue || 0) },
    { label: '总佣金', value: '¥' + formatNum(d.totalCommission || 0) },
  ]
})

const byPlatform = computed(() => {
  return (data.value?.byPlatform || []).map((p: any) => ({
    ...p,
    platformLabel: PLATFORM_LABELS[p.platform] || p.platform,
  }))
})

const trendChartOption = computed(() => {
  const trend = data.value?.dailyTrend || []
  const labelMap: Record<string, string> = {
    revenue: '收入',
    gmv: 'GMV',
    orders: '订单',
    buyerCount: '买家',
    commission: '佣金',
  }
  return {
    tooltip: { trigger: 'axis' as const },
    legend: { data: [labelMap[trendMetric.value]] },
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
    xAxis: {
      type: 'category' as const,
      data: trend.map((d: any) => dayjs(d.date).format('MM-DD')),
    },
    yAxis: { type: 'value' as const },
    series: [
      {
        name: labelMap[trendMetric.value],
        type: 'line' as const,
        smooth: true,
        areaStyle: { opacity: 0.2 },
        data: trend.map((d: any) => d[trendMetric.value] || 0),
      },
    ],
    graphic:
      trend.length === 0
        ? [
            {
              type: 'text',
              left: 'center',
              top: 'center',
              style: { text: '暂无数据', fontSize: 16, fill: '#AEAEB2' },
            },
          ]
        : undefined,
  }
})

function formatNum(n: any): string {
  if (n == null || n === 0) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return Number(n).toLocaleString()
}

async function loadData() {
  try {
    const res = await analyticsApi.getMonetization(days.value)
    data.value = res.data
  } catch {
    ElMessage.error('变现数据加载失败')
  }
}

async function refreshAll() {
  loading.value = true
  await loadData()
  loading.value = false
}

onMounted(() => {
  loadData()
})
</script>

<style lang="scss" scoped>
.monetization {
  &__filter {
    margin-bottom: 20px;
  }
  &__overview {
    margin-bottom: 20px;
  }
  &__chart {
    margin-bottom: 20px;
  }
  &__body {
  }
}

.overview-card {
  text-align: center;
  &__label {
    font-size: 13px;
    color: var(--el-text-color-placeholder);
    margin-bottom: 8px;
  }
  &__value {
    font-size: 28px;
    font-weight: 700;
    color: #f0ece4;
    font-feature-settings: 'tnum';
  }
}

.chart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}
</style>
