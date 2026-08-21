<template>
  <div class="source-page">
    <div class="source-page__header">
      <div>
        <el-button :icon="ArrowLeft" text class="source-page__back" @click="router.back()">
          返回抖店
        </el-button>
        <h2 class="source-page__title">{{ sourceName }}</h2>
        <div class="source-page__meta">
          {{ sourceKindText }} · {{ sourceChannelText }} · {{ rangeLabel }}销售情况
        </div>
      </div>
      <div class="source-page__actions">
        <el-radio-group v-model="rangeMode" size="small" @change="loadData">
          <el-radio-button value="week">近7天</el-radio-button>
          <el-radio-button value="month">近30天</el-radio-button>
        </el-radio-group>
        <el-button :icon="Refresh" circle :loading="loading" @click="loadData" />
      </div>
    </div>

    <div class="source-page__kpi">
      <div class="kpi-card">
        <div class="kpi-card__label">{{ rangeLabel }}出单</div>
        <div class="kpi-card__value">{{ sourceOrders.length }}</div>
        <div class="kpi-card__sub">有效订单</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">{{ rangeLabel }}销售额</div>
        <div class="kpi-card__value">¥{{ centToYuan(sourceGmv) }}</div>
        <div class="kpi-card__sub">按支付金额统计</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">退款</div>
        <div class="kpi-card__value kpi-card__value--danger">¥{{ centToYuan(sourceRefundAmount) }}</div>
        <div class="kpi-card__sub">{{ sourceRefundCount }} 笔成功退款</div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-card__header">
        <span>{{ rangeLabel }}趋势</span>
      </div>
      <DataChart :option="trendOption" :height="280" />
    </div>

    <div class="section-card">
      <div class="section-card__header">
        <span>出单详情</span>
        <span class="section-card__meta">{{ sourceOrders.length }} 条</span>
      </div>
      <div v-loading="loading" class="order-list">
        <div v-if="sourceOrders.length === 0" class="empty-hint">
          <p>{{ rangeLabel }}暂无这个来源的有效订单</p>
        </div>
        <div v-for="order in sourceOrders" :key="order.order_id" class="order-item">
          <img
            v-if="order.product_img"
            :src="order.product_img"
            class="order-item__img"
            @error="hideImg"
          />
          <div class="order-item__info">
            <div class="order-item__title">{{ order.product_title || '未知商品' }}</div>
            <div class="order-item__source">成交来源：{{ orderSourceLabel(order) }}</div>
            <div class="order-item__meta">
              <span class="order-item__time">{{ fmtTime(order.create_time) }}</span>
              <span class="order-item__status" :class="orderStatusClass(order)">
                {{ orderStatus(order) }}
              </span>
              <span>订单号：{{ order.order_id }}</span>
            </div>
          </div>
          <div class="order-item__price">¥{{ centToYuan(order.pay_amount || 0) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import DataChart from '@/components/common/DataChart.vue'
import { doudianStoreApi } from '@/api/doudian-store'
import {
  buildDoudianTrend,
  doudianOrderStatus,
  filterDoudianRefunds,
  getDoudianRevenueOrders,
  getDoudianSuccessfulRefundOrderIds,
  type DoudianAftersaleMetric,
  type DoudianOrderMetric,
} from '@/utils/doudianStoreMetrics'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const rangeMode = ref<'week' | 'month'>('week')
const orders = ref<DoudianOrderMetric[]>([])
const aftersales = ref<DoudianAftersaleMetric[]>([])

const storeId = computed(() => String(route.query.store_id || ''))
const sourceKey = computed(() => String(route.query.source_key || ''))
const sourceName = computed(() => String(route.query.source_name || '未知来源'))
const sourceChannel = computed(() => String(route.query.author_source || ''))
const isSelfSource = computed(() => String(route.query.is_self || '') === '1')

const rangeDays = computed(() => (rangeMode.value === 'month' ? 30 : 7))
const rangeLabel = computed(() => (rangeMode.value === 'month' ? '近30天' : '近7天'))
const detailRange = computed(() => {
  const now = dayjs()
  return { start: now.subtract(rangeDays.value - 1, 'day').startOf('day').unix(), end: now.unix() }
})

const successfulRefundOrderIds = computed(() => getDoudianSuccessfulRefundOrderIds(aftersales.value))
const revenueOrders = computed(() =>
  getDoudianRevenueOrders(orders.value, successfulRefundOrderIds.value),
)
const sourceOrders = computed(() => {
  const { start, end } = detailRange.value
  return revenueOrders.value
    .filter(
      (order) =>
        order.create_time >= start &&
        order.create_time <= end &&
        sourceKeyForOrder(order) === sourceKey.value,
    )
    .sort((a, b) => b.create_time - a.create_time)
})
const sourceOrderIds = computed(() => new Set(sourceOrders.value.map((order) => String(order.order_id))))
const sourceRefunds = computed(() =>
  filterDoudianRefunds(aftersales.value, detailRange.value, rangeMode.value, sourceOrderIds.value),
)
const sourceGmv = computed(() =>
  sourceOrders.value.reduce((sum, order) => sum + Number(order.pay_amount || 0), 0),
)
const sourceRefundAmount = computed(() =>
  sourceRefunds.value.reduce((sum, item) => sum + Number(item.amount || 0), 0),
)
const sourceRefundCount = computed(() => sourceRefunds.value.length)

const trendEntries = computed(() => {
  const entries = buildDoudianTrend(sourceOrders.value, successfulRefundOrderIds.value)
  const byDate = new Map(entries.map((entry) => [entry.date, entry]))
  return Array.from({ length: rangeDays.value }, (_, index) => {
    const date = dayjs.unix(detailRange.value.start).add(index, 'day').format('MM-DD')
    return byDate.get(date) || { date, gmv: 0, orders: 0 }
  })
})
const trendOption = computed(() => {
  const entries = trendEntries.value
  return {
    tooltip: { trigger: 'axis' as const },
    legend: { top: 0, textStyle: { color: '#8b95b6' } },
    grid: { left: 52, right: 36, top: 36, bottom: 24 },
    xAxis: { type: 'category' as const, data: entries.map((e) => e.date) },
    yAxis: [
      { type: 'value' as const, name: '销售额' },
      { type: 'value' as const, name: '订单' },
    ],
    series: [
      {
        name: '销售额(元)',
        type: 'bar' as const,
        barMaxWidth: 30,
        data: entries.map((e) => e.gmv / 100),
      },
      {
        name: '订单数',
        type: 'line' as const,
        yAxisIndex: 1,
        smooth: true,
        data: entries.map((e) => e.orders),
      },
    ],
  }
})

const sourceKindText = computed(() => (isSelfSource.value ? '店铺本身出单' : '带货达人'))
const sourceChannelText = computed(() =>
  isSelfSource.value ? '小店自卖' : sourceSourceLabel(sourceChannel.value),
)

function centToYuan(value: number) {
  return (Number(value || 0) / 100).toFixed(2)
}
function fmtTime(value: number) {
  return value ? dayjs.unix(value).format('MM-DD HH:mm') : '-'
}
function orderStatus(orderOrStatus: any) {
  return doudianOrderStatus(orderOrStatus)
}
function orderStatusClass(orderOrStatus: any) {
  const label = orderStatus(orderOrStatus)
  if (label.includes('完成') || label.includes('发货')) return 'is-done'
  if (label.includes('关闭') || label.includes('取消') || label.includes('退款')) return 'is-muted'
  if (label.includes('待发货')) return 'is-paid'
  return 'is-pending'
}
function sourceSourceLabel(source: string) {
  const value = String(source || '').trim()
  return value || '联盟达人带货'
}
function sourceKeyForOrder(order: DoudianOrderMetric) {
  const name = String(order.author_name || '').trim()
  const authorId = String(order.author_id || '').trim()
  if (!name && !authorId) return '__self_store__'
  return authorId || name
}
function orderSourceLabel(order: DoudianOrderMetric) {
  const name = String(order.author_name || '').trim()
  const authorId = String(order.author_id || '').trim()
  if (!name && !authorId) return `${sourceName.value || '店铺自卖'} · 小店自卖`
  return [name || authorId, sourceSourceLabel(String(order.author_source || ''))]
    .filter(Boolean)
    .join(' · ')
}
function hideImg(event: Event) {
  ;(event.target as HTMLImageElement).style.display = 'none'
}

async function loadData() {
  if (!storeId.value || !sourceKey.value) {
    orders.value = []
    aftersales.value = []
    return
  }

  loading.value = true
  try {
    const { start, end } = detailRange.value
    const [orderRes, aftersaleRes] = await Promise.all([
      doudianStoreApi.getOrders(storeId.value, {
        start_time: start,
        end_time: end,
      }),
      doudianStoreApi.getAftersales(storeId.value, {
        begin_create_time: start,
        end_create_time: end,
      }),
    ])
    orders.value = orderRes.data?.order_list || []
    aftersales.value = aftersaleRes.data?.list || []
  } catch (error: any) {
    ElMessage.error(error?.message || '来源详情加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadData)
</script>

<style lang="scss" scoped>
.source-page {
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: $space-12;
  display: flex;
  flex-direction: column;
  gap: $space-5;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: $space-4;
  }

  &__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: $space-2;
    flex-wrap: wrap;
  }

  &__back {
    margin: 0 0 $space-2 (-$space-2);
  }

  &__title {
    margin: 0;
    color: $text-primary;
    font-size: $text-h1;
    font-weight: 600;
  }

  &__meta {
    margin-top: $space-1;
    color: $text-tertiary;
    font-size: $text-body;
  }

  &__kpi {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: $space-4;
  }

  @media (max-width: 760px) {
    &__header {
      flex-direction: column;
    }

    &__kpi {
      grid-template-columns: 1fr;
    }
  }
}

.kpi-card,
.section-card {
  @include card;
}

.kpi-card {
  padding: $space-5 $space-4;

  &__label {
    color: $text-tertiary;
    font-size: $text-xs;
    font-weight: 500;
    margin-bottom: $space-2;
  }

  &__value {
    color: $text-primary;
    font-size: 26px;
    font-weight: 600;
    font-family: $font-mono;
    font-feature-settings: 'tnum' 1;

    &--danger {
      color: var(--el-color-danger);
    }
  }

  &__sub {
    margin-top: $space-2;
    color: $text-tertiary;
    font-size: $text-xs;
  }
}

.section-card {
  overflow: hidden;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $space-3 $space-5;
    border-bottom: 1px solid var(--el-border-color-lighter);
    color: $text-primary;
    font-size: $text-body;
    font-weight: 600;
  }

  &__meta {
    color: $text-tertiary;
    font-size: $text-xs;
    font-family: $font-mono;
  }
}

.empty-hint {
  padding: $space-12 $space-6;
  text-align: center;
  color: $text-tertiary;
  font-size: $text-body;
}

.order-list {
  min-height: 180px;
  max-height: 640px;
  overflow: auto;
}

.order-item {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 $space-5;
  border-bottom: 1px solid var(--el-border-color-lighter);

  &:last-child {
    border-bottom: 0;
  }

  &__img {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    border-radius: $radius-md;
    object-fit: cover;
    background: var(--el-fill-color-light);
  }

  &__info {
    min-width: 0;
    flex: 1;
  }

  &__title {
    color: $text-primary;
    font-size: $text-sm;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__source {
    margin-top: 4px;
    color: var(--el-color-primary);
    font-size: $text-xs;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    margin-top: 4px;
    color: $text-tertiary;
    font-size: $text-xs;
  }

  &__time {
    font-family: $font-mono;
  }

  &__status {
    padding: 2px 7px;
    border-radius: $radius-full;
    font-weight: 500;

    &.is-done {
      color: var(--el-color-success);
      background: var(--el-color-success-light-9);
    }
    &.is-paid {
      color: var(--el-color-warning);
      background: var(--el-color-warning-light-9);
    }
    &.is-muted {
      color: $text-tertiary;
      background: var(--el-fill-color-light);
    }
    &.is-pending {
      color: var(--el-color-info);
      background: var(--el-color-info-light-9);
    }
  }

  &__price {
    color: $text-primary;
    font-size: $text-body;
    font-weight: 600;
    font-family: $font-mono;
    font-feature-settings: 'tnum' 1;
    flex-shrink: 0;
  }
}
</style>
