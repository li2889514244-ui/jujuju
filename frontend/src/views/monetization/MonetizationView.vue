<template>
  <div class="monetization">
    <div class="monetization__header">
      <h2 class="monetization__title">微信小店</h2>
      <div class="monetization__actions">
        <el-radio-group v-model="viewMode" size="small" @change="loadStoreData">
          <el-radio-button value="today">今天</el-radio-button>
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
        <div class="kpi-card__label">{{ viewMode === 'today' ? '今天销售额' : '近7天销售额' }}</div>
        <div class="kpi-card__value">&yen;{{ centToYuan(orderStats.gmv) }}</div>
        <div class="kpi-card__sub">{{ orderStats.count }} 笔订单</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">售后退款</div>
        <div class="kpi-card__value kpi-card__value--danger">{{ aftersaleCount }}</div>
        <div class="kpi-card__sub">近 24 小时申请</div>
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
            aftersaleCount > 0
              ? `${aftersaleCount} 条，合计 ¥${centToYuan(aftersaleTotal)}`
              : '近24小时无售后'
          }}
          <span class="section-card__toggle">{{ showAftersale ? '收起' : '展开' }}</span>
        </span>
      </div>
      <div v-if="showAftersale && aftersaleList.length > 0" class="order-list">
        <div v-for="a in aftersaleList" :key="a.id" class="order-item">
          <div class="order-item__info">
            <div class="order-item__title">{{ a.product || '未知商品' }}</div>
            <div class="order-item__meta">
              <span>{{ a.reason || '售后' }}</span>
              <span class="order-item__status is-done">{{ aftersaleStatus(a.status) }}</span>
            </div>
          </div>
          <div class="order-item__price order-item__price--refund">
            -&yen;{{ centToYuan(a.amount) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Trend -->
    <div class="section-card monetization__chart">
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
            <div class="order-item__price">&yen;{{ centToYuan(order.pay_amount) }}</div>
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
  type WechatOrder,
  type WechatProduct,
  type WechatStore,
} from '@/api/wechat-store'
import dayjs from 'dayjs'

const loading = ref(false)
const trendMetric = ref('gmv')
const viewMode = ref<'today' | 'week'>('today')
const stores = ref<WechatStore[]>([])
const activeStoreId = ref('')
const orders = ref<WechatOrder[]>([])
const products = ref<WechatProduct[]>([])
const aftersaleCount = ref(0)
const aftersaleList = ref<any[]>([])
const aftersaleTotal = ref(0)
const showAftersale = ref(false)
let prevAftersaleCount = 0
const orderSearch = ref('')
const shopInfo = ref<{ nickname: string; headimg_url: string; subject_type: string } | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

// ── Stats ──
const displayOrders = computed(() => {
  if (viewMode.value === 'today') {
    const start = dayjs().startOf('day').unix()
    const end = dayjs().endOf('day').unix()
    return orders.value.filter((o) => o.create_time >= start && o.create_time <= end)
  }
  return orders.value
})

const orderStats = computed(() => {
  const list = displayOrders.value
  const gmv = list.reduce((s, o) => s + o.pay_amount, 0)
  const count = list.length
  return { gmv, count, avg: count > 0 ? gmv / count : 0 }
})

const sortedProducts = computed(() => [...products.value].sort((a, b) => b.sales - a.sales))

const statusBreakdown = computed(() => {
  const labels: Record<number, string> = {
    10: '待付款',
    20: '待发货',
    30: '已发货',
    100: '已完成',
    250: '已取消',
  }
  const groups: Record<number, number> = {}
  displayOrders.value.forEach((o) => {
    groups[o.status] = (groups[o.status] || 0) + 1
  })
  return [
    ...([10, 20, 30, 100, 250] as const).map((k) => ({ label: labels[k], count: groups[k] || 0 })),
    { label: '售后(24h)', count: aftersaleCount.value },
  ]
})

const filteredOrders = computed(() => {
  if (!orderSearch.value) return displayOrders.value
  const kw = orderSearch.value.toLowerCase()
  return displayOrders.value.filter(
    (o) => (o.product_title || '').toLowerCase().includes(kw) || o.order_id.includes(kw),
  )
})
const filteredOrderCount = computed(() => filteredOrders.value.length)

const trendOption = computed(() => {
  const dailyMap: Record<string, { gmv: number; orders: number }> = {}
  orders.value.forEach((o) => {
    const d = dayjs.unix(o.create_time).format('MM-DD')
    if (!dailyMap[d]) dailyMap[d] = { gmv: 0, orders: 0 }
    dailyMap[d].gmv += o.pay_amount
    dailyMap[d].orders += 1
  })
  const entries = Object.entries(dailyMap).sort()
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 55, right: 20, top: 20, bottom: 20 },
    xAxis: { type: 'category' as const, data: entries.map((e) => e[0]) },
    yAxis: { type: 'value' as const },
    series: [
      {
        name: trendMetric.value === 'gmv' ? '销售额(元)' : '订单数',
        type: 'line' as const,
        smooth: true,
        areaStyle: { opacity: 0.15 },
        data: entries.map((e) => (trendMetric.value === 'orders' ? e[1].orders : e[1].gmv / 100)),
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
    12: '待收下',
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
    const [ordRes, prodRes, afterRes, infoRes] = await Promise.all([
      wechatStoreApi.getOrders(activeStoreId.value, { page_size: 50 }),
      wechatStoreApi.getProducts(activeStoreId.value, { page_size: 50 }),
      wechatStoreApi.getAftersaleCount?.(activeStoreId.value) || Promise.resolve(null),
      wechatStoreApi.getShopInfo?.(activeStoreId.value) || Promise.resolve(null),
    ])
    if (ordRes.data?.errcode === 0) orders.value = ordRes.data.order_list || []
    if (prodRes.data?.errcode === 0) products.value = prodRes.data.products || []
    if (afterRes?.data?.errcode === 0) {
      const raw = afterRes.data.list || []
      const filtered = raw.filter((a: any) => {
        if (a.complete_time && a.create_time && a.complete_time - a.create_time < 60) return false
        return true
      })
      aftersaleList.value = filtered
      const newCount = filtered.length
      if (prevAftersaleCount > 0 && newCount > prevAftersaleCount) {
        const added = newCount - prevAftersaleCount
        const detail = afterRes.data.list?.[0]
        const msg = detail ? `「${detail.product || '商品'}」${detail.reason}` : `${added} 条新退款`
        if (Notification.permission === 'granted') {
          new Notification('新售后提醒', { body: msg })
        }
        showAftersale.value = true
      }
      prevAftersaleCount = newCount
      aftersaleCount.value = newCount
      aftersaleTotal.value = filtered.reduce((s: number, a: any) => s + (a.amount || 0), 0)
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
@import '@/assets/styles/variables';

.monetization {
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 40px;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: $space-lg;
  }
  &__title {
    font-size: $text-headline;
    font-weight: 700;
    color: $color-text-primary;
    margin: 0;
    font-family: $font-heading;
  }
  &__actions {
    display: flex;
    gap: $space-xs;
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
    gap: $space-md;
    margin-bottom: $space-lg;

    &--primary {
      grid-template-columns: repeat(2, 1fr);
    }
    &--status {
      grid-template-columns: repeat(6, 1fr);
    }
  }

  &__chart {
    margin-bottom: $space-lg;
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: $space-lg;
  }

  @media (max-width: 960px) {
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
  gap: 14px;
  margin-bottom: $space-lg;
  padding: $space-md $space-lg;
  @include card;
  &__avatar {
    width: 48px;
    height: 48px;
    border-radius: $radius-md;
    object-fit: cover;
  }
  &__name {
    font-size: 16px;
    font-weight: 600;
    color: $color-text-primary;
  }
  &__meta {
    font-size: 12px;
    color: $color-text-tertiary;
    margin-top: 2px;
  }
}

// KPI cards
.kpi-card {
  @include card;
  padding: $space-lg $space-md;
  text-align: center;

  &--sm {
    padding: $space-sm;
  }

  &__label {
    font-size: 12px;
    color: $color-text-tertiary;
    margin-bottom: 6px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  &__value {
    font-size: 24px;
    font-weight: 700;
    color: $color-text-primary;
    font-feature-settings: 'tnum';
    font-family: $font-mono;
    &--sm {
      font-size: 18px;
    }
    &--danger {
      color: $color-danger;
    }
  }
  &__sub {
    font-size: 11px;
    color: $color-text-tertiary;
    margin-top: 4px;
  }
}

// Section cards (orders, products, chart containers)
.section-card {
  @include card;
  overflow: hidden;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px $space-lg;
    border-bottom: 1px solid $color-border;
    font-size: 14px;
    font-weight: 600;
    color: $color-text-primary;
  }
  &__header-right {
    display: flex;
    align-items: center;
    gap: $space-xs;
  }
  &__meta {
    font-size: 12px;
    color: $color-text-tertiary;
    font-weight: 400;
  }
  &__toggle {
    font-size: 12px;
    color: $color-accent;
    cursor: pointer;
  }
}

// Empty state
.empty-hint {
  padding: 40px;
  text-align: center;
  color: $color-text-tertiary;
  font-size: 14px;
  p {
    margin-bottom: 16px;
  }
}

// Order list
.order-list {
  padding: 10px $space-lg;
  max-height: 450px;
  overflow-y: auto;
}
.order-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid $color-border;
  &:last-child {
    border-bottom: none;
  }
  &__img {
    width: 36px;
    height: 36px;
    border-radius: $radius-sm;
    object-fit: cover;
    flex-shrink: 0;
  }
  &__info {
    flex: 1;
    min-width: 0;
  }
  &__title {
    font-size: 13px;
    color: $color-text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 3px;
  }
  &__meta {
    display: flex;
    gap: $space-xs;
    align-items: center;
  }
  &__time {
    font-size: 11px;
    color: $color-text-tertiary;
  }
  &__status {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 500;
    &.is-done {
      color: $color-success;
      background: rgba($color-success, 0.12);
    }
    &.is-shipping {
      color: $color-accent-alt;
      background: rgba($color-accent-alt, 0.12);
    }
    &.is-paid {
      color: $color-warning;
      background: rgba($color-warning, 0.12);
    }
    &.is-pending {
      color: $color-text-tertiary;
      background: rgba($color-text-tertiary, 0.12);
    }
    &.is-cancel {
      color: $color-danger;
      background: rgba($color-danger, 0.12);
    }
  }
  &__shipped {
    font-size: 10px;
    color: $color-accent-alt;
  }
  &__price {
    font-size: 14px;
    font-weight: 600;
    color: $color-text-primary;
    font-feature-settings: 'tnum';
    flex-shrink: 0;
    &--refund {
      color: $color-danger;
    }
  }
}

// Product grid
.product-grid {
  padding: 10px $space-lg;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  max-height: 450px;
  overflow-y: auto;
}
.product-card {
  display: flex;
  gap: 10px;
  padding: 10px;
  background: $color-bg-tertiary;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  transition: border-color 0.2s;
  &:hover {
    border-color: $color-border-hover;
  }
  &__img {
    width: 44px;
    height: 44px;
    border-radius: $radius-sm;
    object-fit: cover;
    flex-shrink: 0;
  }
  &__info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  &__title {
    font-size: 12px;
    color: $color-text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  &__stats {
    display: flex;
    gap: $space-xs;
    align-items: baseline;
    margin-top: 4px;
    flex-wrap: wrap;
    font-size: 11px;
    color: $color-text-tertiary;
  }
  &__price {
    font-size: 13px;
    font-weight: 600;
    color: $color-text-primary;
    font-feature-settings: 'tnum';
  }
}
</style>
