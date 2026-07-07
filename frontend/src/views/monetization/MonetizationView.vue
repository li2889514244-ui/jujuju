<template>
  <div class="monetization">
    <div class="monetization__header">
      <h2 class="monetization__title">微信小店</h2>
      <div class="monetization__actions">
        <el-radio-group v-model="viewMode" size="small" @change="loadStoreData">
          <el-radio-button value="today">今天</el-radio-button>
          <el-radio-button value="yesterday">昨天</el-radio-button>
          <el-radio-button value="week">近7天</el-radio-button>
        </el-radio-group>
        <el-select
          v-model="activeStoreId"
          placeholder="选择店铺"
          size="small"
          class="monetization__store-select"
          @change="loadStoreData"
        >
          <el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-button :icon="Refresh" circle size="small" :loading="loading" @click="loadStoreData" />
      </div>
    </div>

    <div v-if="!loading && stores.length === 0" class="empty-hint monetization__empty-store">
      <p>暂无可用微信小店，或当前登录态无法读取店铺。</p>
    </div>

    <!-- Shop Info -->
    <div v-if="shopInfo" class="shop-info">
      <img
        v-if="shopInfo.headimg_url"
        :src="shopInfo.headimg_url"
        class="shop-info__avatar"
        @error="hideImg"
      />
      <div>
        <div class="shop-info__name">{{ shopInfo.nickname }}</div>
        <div class="shop-info__meta">{{ shopInfo.subject_type }} · 已开通</div>
      </div>
    </div>

    <!-- KPI -->
    <div class="monetization__kpi monetization__kpi--primary">
      <div class="kpi-card">
        <div class="kpi-card__label">{{ rangeAmountLabel }}</div>
        <div class="kpi-card__value">&yen;{{ centToYuan(orderStats.gross) }}</div>
        <div class="kpi-card__sub">{{ orderStatsSub }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">{{ rangeOrderLabel }}</div>
        <div class="kpi-card__value">{{ orderStats.transactionCount }}</div>
        <div class="kpi-card__sub">{{ effectiveOrderSub }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">{{ rangeRefundLabel }}</div>
        <div class="kpi-card__value kpi-card__value--danger">
          &yen;{{ centToYuan(orderStats.refund) }}
        </div>
        <div class="kpi-card__sub">{{ orderStats.refundCount }} 笔退款</div>
      </div>
    </div>

    <!-- Order Status -->
    <div class="monetization__kpi monetization__kpi--status">
      <div v-for="s in statusBreakdown" :key="s.label" class="kpi-card kpi-card--sm">
        <div class="kpi-card__label">{{ s.label }}</div>
        <div class="kpi-card__value kpi-card__value--sm">{{ s.count }}</div>
      </div>
    </div>

    <!-- Aftersale (collapsible) -->
    <div class="section-card">
      <div class="section-card__header" @click="showAftersale = !showAftersale">
        <span>售后/退款</span>
        <span class="section-card__meta">
          {{
            rangeAftersaleList.length > 0
              ? `${rangeAftersaleList.length} 条，合计 ¥${centToYuan(rangeAftersaleTotal)}`
              : '当前时段无售后'
          }}
          <span class="section-card__toggle">{{ showAftersale ? '收起' : '展开' }}</span>
        </span>
      </div>
      <div v-if="showAftersale && rangeAftersaleList.length > 0" class="order-list">
        <div v-for="a in rangeAftersaleList" :key="a.id" class="order-item">
          <div class="order-item__info">
            <div class="order-item__title">{{ a.product || '未知商品' }}</div>
            <div class="order-item__meta">
              <span>{{ a.reason || '售后' }}</span>
              <span class="order-item__status is-done">{{ aftersaleStatus(a.status) }}</span>
            </div>
          </div>
          <div class="order-item__price order-item__price--refund">
            {{ isSuccessfulAftersale(a) ? '-' : '' }}&yen;{{ centToYuan(a.amount) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Trend -->
    <div v-if="trendEntries.length > 1" class="section-card monetization__chart">
      <div class="section-card__header">
        <span>销售趋势</span>
        <el-radio-group v-model="trendMetric" size="small">
          <el-radio-button value="gmv">销售额</el-radio-button>
          <el-radio-button value="orders">订单数</el-radio-button>
        </el-radio-group>
      </div>
      <DataChart :option="trendOption" :height="260" />
    </div>

    <!-- Orders + Products -->
    <div class="monetization__grid">
      <div class="section-card">
        <div class="section-card__header">
          <span>最近订单</span>
          <div class="section-card__header-right">
            <el-input
              v-model="orderSearch"
              placeholder="搜索订单…"
              size="small"
              class="monetization__search-input"
              clearable
            />
            <span class="section-card__meta">{{ filteredOrderCount }} 条</span>
          </div>
        </div>
        <div v-loading="loading" class="order-list">
          <div v-if="filteredOrders.length === 0" class="empty-hint">
            <p>{{ orderSearch ? '无匹配订单' : '暂无订单' }}</p>
            <el-button v-if="!orderSearch" size="small" text type="primary" @click="loadStoreData">
              <el-icon><Refresh /></el-icon>刷新数据
            </el-button>
          </div>
          <div
            v-for="order in filteredOrders.slice(0, 20)"
            :key="order.order_id"
            class="order-item"
          >
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
                <span class="order-item__status" :class="statusClass(order.status)">{{
                  statusLabel(order.status)
                }}</span>
                <span v-if="order.ship_time" class="order-item__shipped">已发货</span>
              </div>
            </div>
            <div class="order-item__price">
              &yen;{{ centToYuan(order.product_price || order.pay_amount) }}
            </div>
          </div>
        </div>
      </div>

      <div class="section-card">
        <div class="section-card__header">
          <span>商品列表</span>
          <span class="section-card__meta">{{ products.length }} 件</span>
        </div>
        <div v-loading="loading" class="product-grid">
          <div v-if="products.length === 0" class="empty-hint">
            <p>暂无商品</p>
            <el-button size="small" text type="primary" @click="loadStoreData">
              <el-icon><Refresh /></el-icon>同步商品
            </el-button>
          </div>
          <div v-for="prod in sortedProducts" :key="prod.product_id" class="product-card">
            <img
              v-if="prod.img_url"
              :src="prod.img_url"
              class="product-card__img"
              @error="hideImg"
            />
            <div class="product-card__info">
              <div class="product-card__title">{{ prod.title }}</div>
              <div class="product-card__stats">
                <span class="product-card__price">&yen;{{ centToYuan(prod.selling_price) }}</span>
                <span>已售 {{ fmtNum(prod.sales) }}</span>
                <span>库存 {{ prod.stock }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import DataChart from '@/components/common/DataChart.vue'
import {
  wechatStoreApi,
  type WechatAftersale,
  type WechatOrder,
  type WechatProduct,
  type WechatStore,
} from '@/api/wechat-store'
import dayjs from 'dayjs'
import {
  buildDailySales,
  buildStatusBreakdown,
  calculateNetSales,
  normalizeAftersales,
} from '@/utils/wechatStoreMetrics'

const loading = ref(false)
const trendMetric = ref('gmv')
const viewMode = ref<'today' | 'yesterday' | 'week'>('yesterday')
const stores = ref<WechatStore[]>([])
const activeStoreId = ref('')
const orders = ref<WechatOrder[]>([])
const products = ref<WechatProduct[]>([])
const rangeAftersaleList = ref<WechatAftersale[]>([])
const allAftersaleList = ref<WechatAftersale[]>([])
let prevAftersaleCount = 0
const showAftersale = ref(false)
const orderSearch = ref('')
const shopInfo = ref<{ nickname: string; headimg_url: string; subject_type: string } | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

// ── Stats ──
const rangeAmountLabel = computed(() => {
  const labels = {
    today: '今天成交金额',
    yesterday: '昨天成交金额',
    week: '近7天成交金额',
  }
  return labels[viewMode.value]
})

const rangeOrderLabel = computed(() => {
  const labels = {
    today: '今天成交订单',
    yesterday: '昨天成交订单',
    week: '近7天成交订单',
  }
  return labels[viewMode.value]
})

const rangeRefundLabel = computed(() => {
  const labels = {
    today: '今天退款金额',
    yesterday: '昨天退款金额',
    week: '近7天退款金额',
  }
  return labels[viewMode.value]
})

const displayRange = computed(() => {
  const now = dayjs()
  if (viewMode.value === 'yesterday') {
    const day = now.subtract(1, 'day')
    return { start: day.startOf('day').unix(), end: day.endOf('day').unix() }
  }
  if (viewMode.value === 'week') {
    return { start: now.subtract(6, 'day').startOf('day').unix(), end: now.unix() }
  }
  return { start: now.startOf('day').unix(), end: now.unix() }
})

const displayOrders = computed(() => {
  const { start, end } = displayRange.value
  return orders.value.filter((o) => o.create_time >= start && o.create_time <= end)
})

const orderStats = computed(() => {
  return calculateNetSales(displayOrders.value, rangeAftersaleList.value)
})

const orderStatsSub = computed(() => {
  const { gross, refund, transactionCount, effectiveCount } = orderStats.value
  const net = gross - refund
  if (transactionCount === 0) return '0 笔订单'
  const netText = refund > 0 ? `净额 ¥${centToYuan(net)}` : ''
  const countText =
    effectiveCount === transactionCount
      ? `${transactionCount} 笔`
      : `${effectiveCount} 有效 / ${transactionCount} 总`
  return netText ? `${countText}，${netText}` : countText
})

const effectiveOrderSub = computed(() => {
  const { transactionCount, effectiveCount } = orderStats.value
  if (transactionCount === 0) return '暂无订单'
  return effectiveCount === transactionCount ? '全部有效' : `${effectiveCount} 笔有效`
})

const sortedProducts = computed(() => [...products.value].sort((a, b) => b.sales - a.sales))

const statusBreakdown = computed(() => {
  return [
    ...buildStatusBreakdown(displayOrders.value),
    { label: '售后', count: rangeAftersaleList.value.length },
  ]
})

const rangeAftersaleTotal = computed(() => {
  return rangeAftersaleList.value.reduce(
    (s, a) => s + (isSuccessfulAftersale(a) ? a.amount || 0 : 0),
    0,
  )
})

const filteredOrders = computed(() => {
  if (!orderSearch.value) return displayOrders.value
  const kw = orderSearch.value.toLowerCase()
  return displayOrders.value.filter(
    (o) => (o.product_title || '').toLowerCase().includes(kw) || o.order_id.includes(kw),
  )
})
const filteredOrderCount = computed(() => filteredOrders.value.length)

const trendEntries = computed(() => buildDailySales(displayOrders.value, rangeAftersaleList.value))

const trendOption = computed(() => {
  const entries = trendEntries.value
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 55, right: 20, top: 20, bottom: 20 },
    xAxis: { type: 'category' as const, data: entries.map((e) => e.date) },
    yAxis: { type: 'value' as const },
    series: [
      {
        name: trendMetric.value === 'gmv' ? '销售额(元)' : '订单数',
        type: 'line' as const,
        smooth: true,
        areaStyle: { opacity: 0.15 },
        data: entries.map((e) => (trendMetric.value === 'orders' ? e.orders : e.gmv / 100)),
      },
    ],
    graphic:
      entries.length === 0
        ? [
            {
              type: 'text' as const,
              left: 'center',
              top: 'center',
              style: { text: '暂无数据', fontSize: 14, fill: '#6b7390' },
            },
          ]
        : undefined,
  }
})

// ── Helpers ──
function centToYuan(c: number) {
  return (c / 100).toFixed(2)
}
function fmtNum(n: number): string {
  return n >= 10000 ? (n / 10000).toFixed(1) + '万' : n.toLocaleString()
}
function fmtTime(ts: number) {
  return ts ? dayjs.unix(ts).format('MM-DD HH:mm') : '-'
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
  return m[s] || `状态${s}`
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
function aftersaleStatus(s: string) {
  return s === 'MERCHANT_REFUND_SUCCESS' ? '已退款' : s === 'USER_WAIT_RETURN' ? '待退货' : s
}

// ── API ──
function isSuccessfulAftersale(a: WechatAftersale) {
  return a.status === 'MERCHANT_REFUND_SUCCESS'
}

async function loadStores() {
  try {
    const res = await wechatStoreApi.getStores()
    const list = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : []
    stores.value = list
    if (stores.value.length > 0 && !activeStoreId.value) activeStoreId.value = stores.value[0].id
  } catch (error: any) {
    stores.value = []
    activeStoreId.value = ''
    ElMessage.error(error?.message || '微信小店店铺加载失败，请重新登录后再试')
  }
}

async function loadStoreData() {
  if (!activeStoreId.value) return
  loading.value = true
  try {
    const { start, end } = displayRange.value
    const [ordRes, prodRes, afterRes, rangeAfterRes, infoRes] = await Promise.all([
      wechatStoreApi.getOrders(activeStoreId.value, { page_size: 5000 }),
      wechatStoreApi.getProducts(activeStoreId.value, { page_size: 50 }),
      wechatStoreApi.getAftersaleCount?.(activeStoreId.value) || Promise.resolve(null),
      wechatStoreApi.getAftersaleCount?.(activeStoreId.value, {
        begin_create_time: start,
        end_create_time: end,
      }) || Promise.resolve(null),
      wechatStoreApi.getShopInfo?.(activeStoreId.value) || Promise.resolve(null),
    ])
    if (ordRes.data?.errcode === 0) orders.value = ordRes.data.order_list || []
    if (prodRes.data?.errcode === 0) products.value = prodRes.data.products || []
    if (afterRes?.data?.errcode === 0) {
      const raw = (afterRes.data.list || []) as WechatAftersale[]
      const filtered = normalizeAftersales(raw)
      allAftersaleList.value = filtered
      const newCount = filtered.length
      if (prevAftersaleCount > 0 && newCount > prevAftersaleCount) {
        const added = newCount - prevAftersaleCount
        const detail = filtered[0]
        const msg = detail ? `「${detail.product || '商品'}」${detail.reason}` : `${added} 条新退款`
        if (Notification.permission === 'granted') {
          new Notification('新售后提醒', { body: msg })
        }
        showAftersale.value = true
      }
      prevAftersaleCount = newCount
    }
    if (rangeAfterRes?.data?.errcode === 0) {
      rangeAftersaleList.value = normalizeAftersales(
        (rangeAfterRes.data.list || []) as WechatAftersale[],
      )
    } else {
      rangeAftersaleList.value = []
    }
    if (infoRes?.data?.errcode === 0) shopInfo.value = infoRes.data.info || null
  } catch (error: any) {
    ElMessage.error(error?.message || '微信小店数据同步失败')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission()
  }
  await loadStores()
  await loadStoreData()
  timer = setInterval(loadStoreData, 60000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style lang="scss" scoped>
.monetization {
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: $space-12;
  display: flex;
  flex-direction: column;
  gap: $space-5;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  &__title {
    font-size: $text-h1;
    font-weight: 600;
    color: $text-primary;
    margin: 0;
    letter-spacing: -0.025em;
  }
  &__actions {
    display: flex;
    gap: $space-2;
    align-items: center;
  }
  &__store-select {
    width: 160px;
    flex-shrink: 0;
  }
  &__search-input {
    width: 160px;
    flex-shrink: 0;
  }

  &__kpi {
    display: grid;
    gap: $space-4;
    margin-bottom: 0;

    &--primary {
      grid-template-columns: repeat(3, 1fr);
    }
    &--status {
      grid-template-columns: repeat(6, 1fr);
    }
  }

  &__chart {
    border-radius: $radius-lg;
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: $space-5;
  }

  &__empty-store {
    text-align: center;
  }

  @media (max-width: 960px) {
    &__kpi--primary {
      grid-template-columns: 1fr;
    }
    &__kpi--status {
      grid-template-columns: repeat(3, 1fr);
    }
    &__grid {
      grid-template-columns: 1fr;
    }
  }
}

// Shop info
.shop-info {
  display: flex;
  align-items: center;
  gap: $space-3;
  padding: $space-4 $space-5;
  @include card;
  &__avatar {
    width: 48px;
    height: 48px;
    border-radius: $radius-md;
    object-fit: cover;
    background: $bg-hover;
  }
  &__name {
    font-size: 16px;
    font-weight: 600;
    color: $text-primary;
    letter-spacing: -0.01em;
  }
  &__meta {
    font-size: $text-xs;
    color: $text-tertiary;
    margin-top: 2px;
  }
}

// KPI cards
.kpi-card {
  @include card;
  padding: $space-5 $space-4;
  text-align: left;

  &--sm {
    padding: $space-3;
  }

  &__label {
    font-size: $text-xs;
    color: $text-tertiary;
    margin-bottom: $space-2;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  &__value {
    font-size: 26px;
    font-weight: 600;
    color: $text-primary;
    font-feature-settings: 'tnum' 1;
    font-variant-numeric: tabular-nums;
    font-family: $font-mono;
    letter-spacing: -0.02em;
    line-height: 1.15;
    &--sm {
      font-size: 18px;
    }
    &--danger {
      color: $color-danger;
    }
  }
  &__sub {
    font-size: $text-micro;
    color: $text-tertiary;
    margin-top: $space-2;
  }
}

// Section cards
.section-card {
  @include card;
  overflow: hidden;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $space-3 $space-5;
    border-bottom: 1px solid $border-subtle;
    font-size: $text-body;
    font-weight: 600;
    color: $text-primary;
    letter-spacing: -0.005em;
  }
  &__header-right {
    display: flex;
    align-items: center;
    gap: $space-2;
  }
  &__meta {
    font-size: $text-xs;
    color: $text-tertiary;
    font-weight: 400;
    font-family: $font-mono;
    font-feature-settings: 'tnum' 1;
  }
  &__toggle {
    font-size: $text-xs;
    color: $accent-400;
    cursor: pointer;
    font-weight: 500;
    margin-left: $space-2;
  }
}

// Empty state
.empty-hint {
  padding: $space-12 $space-6;
  text-align: center;
  color: $text-tertiary;
  font-size: $text-body;
  p {
    margin-bottom: $space-4;
  }
}

// Order list
.order-list {
  padding: $space-2 $space-5;
  max-height: 450px;
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
    width: 36px;
    height: 36px;
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
    font-size: $text-body;
    color: $text-primary;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 3px;
  }
  &__meta {
    display: flex;
    gap: $space-2;
    align-items: center;
  }
  &__time {
    font-size: $text-micro;
    color: $text-tertiary;
    font-family: $font-mono;
  }
  &__status {
    font-size: $text-micro;
    padding: 2px 7px;
    border-radius: $radius-full;
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
    font-size: $text-micro;
    color: $color-info;
  }
  &__price {
    font-size: $text-body;
    font-weight: 600;
    color: $text-primary;
    font-family: $font-mono;
    font-feature-settings: 'tnum' 1;
    flex-shrink: 0;
    &--refund {
      color: $color-danger;
    }
  }
}

// Product grid
.product-grid {
  padding: $space-2 $space-5;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: $space-2;
  max-height: 450px;
  overflow-y: auto;
}
.product-card {
  display: flex;
  gap: $space-2;
  padding: $space-2;
  background: rgba(255, 255, 255, 0.015);
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  transition: border-color 0.2s $ease-out;
  &:hover {
    border-color: $border-strong;
  }
  &__img {
    width: 44px;
    height: 44px;
    border-radius: $radius-sm;
    object-fit: cover;
    flex-shrink: 0;
    background: $bg-hover;
  }
  &__info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  &__title {
    font-size: $text-xs;
    color: $text-primary;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  &__stats {
    display: flex;
    gap: $space-2;
    align-items: baseline;
    margin-top: 4px;
    flex-wrap: wrap;
    font-size: $text-micro;
    color: $text-tertiary;
  }
  &__price {
    font-size: $text-body;
    font-weight: 600;
    color: $text-primary;
    font-family: $font-mono;
    font-feature-settings: 'tnum' 1;
  }
}
</style>
