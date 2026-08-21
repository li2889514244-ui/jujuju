<template>
  <div class="source-page">
    <div class="source-page__header">
      <div>
        <el-button :icon="ArrowLeft" text class="source-page__back" @click="router.back()">
          返回微信小店
        </el-button>
        <h2 class="source-page__title">{{ sourceName }}</h2>
        <div class="source-page__meta">
          {{ sourceTypeText }} · {{ saleChannelText }} · {{ rangeLabel }}销售情况
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
        <div class="kpi-card__sub">已发货订单</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">{{ rangeLabel }}销售额</div>
        <div class="kpi-card__value">¥{{ centToYuan(sourceGmv) }}</div>
        <div class="kpi-card__sub">按商品金额统计</div>
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
          <p>{{ rangeLabel }}暂无这个来源的已发货订单</p>
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
            <div class="order-item__meta">
              <span class="order-item__time">{{ fmtTime(order.create_time) }}</span>
              <span class="order-item__status" :class="statusClass(order.status)">
                {{ statusLabel(order.status) }}
              </span>
              <span v-if="order.ship_time" class="order-item__shipped">已发货</span>
              <span>订单号：{{ order.order_id }}</span>
            </div>
            <div class="order-item__source">成交来源：{{ orderSourceLabel(order) }}</div>
          </div>
          <div class="order-item__price">¥{{ centToYuan(order.product_price || order.pay_amount) }}</div>
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
import {
  wechatStoreApi,
  type WechatAftersale,
  type WechatOrder,
  type WechatOrderSourceInfo,
} from '@/api/wechat-store'
import { buildDailySales, normalizeAftersales } from '@/utils/wechatStoreMetrics'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const rangeMode = ref<'week' | 'month'>('week')
const orders = ref<WechatOrder[]>([])
const aftersales = ref<WechatAftersale[]>([])

const storeId = computed(() => String(route.query.store_id || ''))
const sourceKey = computed(() => String(route.query.source_key || ''))
const sourceName = computed(() => String(route.query.source_name || '未知来源'))
const accountType = computed(() => String(route.query.account_type || ''))
const saleChannel = computed(() => String(route.query.sale_channel || ''))

const rangeDays = computed(() => (rangeMode.value === 'month' ? 30 : 7))
const rangeLabel = computed(() => (rangeMode.value === 'month' ? '近30天' : '近7天'))

const detailRange = computed(() => {
  const now = dayjs()
  return { start: now.subtract(rangeDays.value - 1, 'day').startOf('day').unix(), end: now.unix() }
})

const sourceOrders = computed(() => {
  const { start, end } = detailRange.value
  return orders.value
    .filter(
      (order) =>
        order.create_time >= start &&
        order.create_time <= end &&
        isShippedForSource(order) &&
        sourceKeyForOrder(order) === sourceKey.value,
    )
    .sort((a, b) => b.create_time - a.create_time)
})

const sourceOrderIds = computed(() => new Set(sourceOrders.value.map((order) => String(order.order_id))))

const sourceRefunds = computed(() => {
  return aftersales.value.filter((item) => {
    if (!isSuccessfulAftersale(item) || !item.order_id) return false
    return sourceOrderIds.value.has(String(item.order_id))
  })
})

const sourceGmv = computed(() => {
  return sourceOrders.value.reduce(
    (sum, order) => sum + Number(order.product_price || order.pay_amount || 0),
    0,
  )
})
const sourceRefundAmount = computed(() => {
  return sourceRefunds.value.reduce((sum, item) => sum + Number(item.amount || 0), 0)
})
const sourceRefundCount = computed(() => sourceRefunds.value.length)

const trendEntries = computed(() => {
  const entries = buildDailySales(sourceOrders.value, sourceRefunds.value)
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

const sourceTypeText = computed(() => sourceTypeLabel(accountType.value))
const saleChannelText = computed(() => saleChannelLabel(saleChannel.value))

function centToYuan(c: number) {
  return (c / 100).toFixed(2)
}
function fmtTime(ts: number) {
  return ts ? dayjs.unix(ts).format('MM-DD HH:mm') : '-'
}
function isShippedForSource(order: WechatOrder) {
  return Number(order.ship_time || 0) > 0
}
function isSuccessfulAftersale(a: WechatAftersale) {
  return a.status === 'MERCHANT_REFUND_SUCCESS'
}
function primaryOrderSource(order: WechatOrder): WechatOrderSourceInfo | null {
  return order.source_infos?.find((source) => source.account_nickname || source.account_id) || null
}
function sourceForAttribution(order: WechatOrder): WechatOrderSourceInfo {
  return (
    primaryOrderSource(order) || {
      account_type: 'store',
      account_id: `store:${storeId.value}`,
      account_nickname: '店铺出单',
      sale_channel: 'store',
    }
  )
}
function sourceKeyForOrder(order: WechatOrder): string {
  const source = sourceForAttribution(order)
  return source.account_id || `${source.account_type}:${source.account_nickname}`
}
function orderSourceLabel(order: WechatOrder): string {
  const source = sourceForAttribution(order)
  const name = source.account_nickname || source.account_id
  return [name, sourceTypeLabel(source.account_type)].filter(Boolean).join(' · ')
}
function sourceTypeLabel(type: string) {
  const labels: Record<string, string> = {
    '1': '视频号',
    '5': '带货达人',
    store: '店铺',
  }
  return labels[type] || (type ? `来源类型 ${type}` : '未知类型')
}
function saleChannelLabel(channel: string) {
  const labels: Record<string, string> = {
    '0': '关联账号',
    '100': '联盟达人带货',
    store: '官网来源：-',
  }
  return labels[channel] || (channel ? `渠道 ${channel}` : '未知渠道')
}
function statusLabel(s: number) {
  const m: Record<number, string> = {
    10: '待付款',
    12: '待收款',
    20: '待发货',
    21: '部分发货',
    30: '待收货',
    100: '已完成',
    200: '全部退款',
    250: '已取消',
  }
  return m[s] || `状态 ${s}`
}
function statusClass(s: number) {
  if (s === 200 || s === 250) return 'is-cancel'
  if (s === 100) return 'is-done'
  if (s >= 30) return 'is-shipping'
  if (s >= 20) return 'is-paid'
  if (s >= 10) return 'is-pending'
  return 'is-cancel'
}
function hideImg(e: Event) {
  ;(e.target as HTMLImageElement).style.display = 'none'
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
    const [ordRes, afterRes] = await Promise.all([
      wechatStoreApi.getOrders(storeId.value, {
        page_size: 5000,
        start_time: start,
        end_time: end,
      }),
      wechatStoreApi.getAftersaleCount?.(storeId.value, {
        begin_create_time: start,
        end_create_time: Math.max(end, Math.floor(Date.now() / 1000)),
      }) || Promise.resolve(null),
    ])
    orders.value = ordRes.data?.errcode === 0 ? ordRes.data.order_list || [] : []
    aftersales.value =
      afterRes?.data?.errcode === 0
        ? normalizeAftersales((afterRes.data.list || []) as WechatAftersale[])
        : []
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
      color: $color-danger;
    }
  }

  &__sub {
    margin-top: $space-2;
    color: $text-tertiary;
    font-size: $text-micro;
  }
}

.section-card {
  overflow: hidden;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $space-3 $space-5;
    border-bottom: 1px solid $border-subtle;
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
  padding: $space-2 $space-5;
  max-height: 640px;
  overflow-y: auto;
}

.order-item {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-3 0;
  border-bottom: 1px solid $border-subtle;

  &:last-child {
    border-bottom: none;
  }

  &__img {
    width: 40px;
    height: 40px;
    border-radius: $radius-sm;
    object-fit: cover;
    flex-shrink: 0;
    background: $bg-hover;
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__title {
    margin-bottom: 3px;
    color: $text-primary;
    font-size: $text-body;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: $space-2;
    color: $text-tertiary;
    font-size: $text-micro;
  }

  &__time {
    font-family: $font-mono;
  }

  &__status {
    padding: 2px 7px;
    border-radius: $radius-full;
    font-size: $text-micro;
    font-weight: 500;

    &.is-done {
      color: $color-success;
      background: rgba($color-success, 0.12);
    }
    &.is-shipping {
      color: $color-info;
      background: rgba($color-info, 0.12);
    }
    &.is-paid {
      color: $color-warning;
      background: rgba($color-warning, 0.14);
    }
    &.is-pending {
      color: $text-tertiary;
      background: rgba($text-tertiary, 0.12);
    }
    &.is-cancel {
      color: $color-danger;
      background: rgba($color-danger, 0.12);
    }
  }

  &__shipped {
    color: $color-info;
  }

  &__source {
    margin-top: 4px;
    color: $accent-300;
    font-size: $text-micro;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
