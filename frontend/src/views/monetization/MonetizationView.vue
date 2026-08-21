<template>
  <div class="monetization">
    <div class="monetization__header">
      <h2 class="monetization__title">微信小店</h2>
      <div class="monetization__actions">
        <el-radio-group v-model="viewMode" size="small" @change="loadStoreData">
          <el-radio-button value="today">今天</el-radio-button>
          <el-radio-button value="yesterday">昨天</el-radio-button>
          <el-radio-button value="week">近7天</el-radio-button>
          <el-radio-button value="month">近30天</el-radio-button>
          <el-radio-button value="current_month">当月</el-radio-button>
          <el-radio-button value="custom">自定义</el-radio-button>
        </el-radio-group>
        <el-date-picker
          v-if="viewMode === 'custom'"
          v-model="customRange"
          type="daterange"
          unlink-panels
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          size="small"
          class="monetization__date-range"
          @change="loadStoreData"
        />
        <el-select
          v-model="activeStoreId"
          placeholder="选择店铺"
          size="small"
          class="monetization__store-select"
          @change="loadStoreData"
        >
          <el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-button type="primary" :icon="Plus" size="small" @click="openCreateStore">
          添加小店
        </el-button>
        <el-button :icon="Refresh" circle size="small" :loading="loading" @click="loadStoreData" />
      </div>
    </div>

    <div v-if="storesLoading" v-loading="storesLoading" class="monetization__store-loading"></div>

    <div
      v-else-if="storesLoaded && stores.length === 0"
      class="empty-hint monetization__empty-store"
    >
      <p>暂无可用微信小店，或当前登录态无法读取店铺。</p>
      <el-button type="primary" :icon="Plus" @click="openCreateStore">手动添加微信小店</el-button>
    </div>

    <el-dialog v-model="showCreateStore" title="添加微信小店" width="520px">
      <el-form :model="createStoreForm" label-width="92px">
        <el-form-item label="店铺名称" required>
          <el-input v-model="createStoreForm.name" placeholder="例如：披星云微信小店" />
        </el-form-item>
        <el-form-item label="AppID" required>
          <el-input v-model="createStoreForm.appId" placeholder="微信小店 / 视频号小店 AppID" />
        </el-form-item>
        <el-form-item label="AppSecret" required>
          <el-input
            v-model="createStoreForm.appSecret"
            type="password"
            show-password
            placeholder="对应 AppSecret"
          />
        </el-form-item>
      </el-form>
      <div class="monetization__form-note">
        保存后会立即尝试同步近 30 天商品、订单和售后数据。请确认该 AppID
        已具备微信小店相关接口权限。
      </div>
      <template #footer>
        <el-button @click="showCreateStore = false">取消</el-button>
        <el-button type="primary" :loading="creatingStore" @click="createStore"
          >保存并同步</el-button
        >
      </template>
    </el-dialog>

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

    <div class="section-card">
      <div class="section-card__header">
        <span>出单来源</span>
        <span class="section-card__meta">
          {{ sourceRanking.length ? `${sourceRanking.length} 个来源` : '当前时段暂无已发货来源' }}
        </span>
      </div>
      <div v-if="sourceRanking.length > 0" class="source-ranking">
        <div
          v-for="source in sourceRanking.slice(0, 8)"
          :key="source.key"
          class="source-row"
          role="button"
          tabindex="0"
          @click="openSourceDetail(source)"
          @keydown.enter.prevent="openSourceDetail(source)"
          @keydown.space.prevent="openSourceDetail(source)"
        >
          <div class="source-row__main">
            <div class="source-row__name">{{ source.name }}</div>
            <div class="source-row__meta">
              <span>{{ sourceTypeLabel(source.accountType) }}</span>
              <span>{{ saleChannelLabel(source.saleChannel) }}</span>
            </div>
          </div>
          <div class="source-row__stats">
            <strong>{{ source.orders }}</strong>
            <span>单</span>
            <em>&yen;{{ centToYuan(source.gmv) }}</em>
            <small v-if="source.refundCount > 0">
              退款 {{ source.refundCount }} 单 / &yen;{{ centToYuan(source.refundAmount) }}
            </small>
          </div>
        </div>
      </div>
      <div v-else class="empty-hint source-ranking__empty">
        <p>当前时段暂无已发货订单来源</p>
      </div>
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
              <div v-if="orderSourceLabel(order)" class="order-item__source">
                成交来源：{{ orderSourceLabel(order) }}
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
import { useRouter } from 'vue-router'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import DataChart from '@/components/common/DataChart.vue'
import {
  wechatStoreApi,
  type WechatAftersale,
  type WechatOrder,
  type WechatOrderSourceInfo,
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
const router = useRouter()
const storesLoading = ref(true)
const storesLoaded = ref(false)
const creatingStore = ref(false)
const trendMetric = ref('gmv')
type WechatViewMode = 'today' | 'yesterday' | 'week' | 'month' | 'current_month' | 'custom'

const viewMode = ref<WechatViewMode>('yesterday')
const stores = ref<WechatStore[]>([])
const activeStoreId = ref('')
const showCreateStore = ref(false)
const createStoreForm = ref({ name: '', appId: '', appSecret: '' })
const orders = ref<WechatOrder[]>([])
const products = ref<WechatProduct[]>([])
const rangeAftersaleList = ref<WechatAftersale[]>([])
const allAftersaleList = ref<WechatAftersale[]>([])
const sourceAftersaleList = ref<WechatAftersale[]>([])
let prevAftersaleCount = 0
const showAftersale = ref(false)
const orderSearch = ref('')
const shopInfo = ref<{ nickname: string; headimg_url: string; subject_type: string } | null>(null)
const customRange = ref<[Date, Date] | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

interface SourceSummary {
  key: string
  name: string
  accountType: string
  saleChannel: string
  orders: number
  gmv: number
  refundCount: number
  refundAmount: number
}

function clearStoreData() {
  orders.value = []
  products.value = []
  rangeAftersaleList.value = []
  allAftersaleList.value = []
  sourceAftersaleList.value = []
  shopInfo.value = null
}

// ── Stats ──
const rangeAmountLabel = computed(() => {
  if (viewMode.value === 'custom') return `${displayRangeLabel.value}成交金额`
  const labels = {
    today: '今天成交金额',
    yesterday: '昨天成交金额',
    week: '近7天成交金额',
    month: '近30天成交金额',
    current_month: '当月成交金额',
    custom: '自定义时段成交金额',
  }
  return labels[viewMode.value]
})

const rangeOrderLabel = computed(() => {
  const labels = {
    today: '今天成交订单',
    yesterday: '昨天成交订单',
    week: '近7天成交订单',
    month: '近30天成交订单',
    current_month: '当月成交订单',
    custom: '自定义时段成交订单',
  }
  return labels[viewMode.value]
})

const rangeRefundLabel = computed(() => {
  const labels = {
    today: '今天退款金额',
    yesterday: '昨天退款金额',
    week: '近7天退款金额',
    month: '近30天退款金额',
    current_month: '当月退款金额',
    custom: '自定义时段退款金额',
  }
  return labels[viewMode.value]
})

const displayRange = computed(() => {
  const now = dayjs()
  if (viewMode.value === 'custom' && customRange.value?.length === 2) {
    const [start, end] = customRange.value
    return { start: dayjs(start).startOf('day').unix(), end: dayjs(end).endOf('day').unix() }
  }
  if (viewMode.value === 'current_month') {
    return { start: now.startOf('month').unix(), end: now.unix() }
  }
  if (viewMode.value === 'yesterday') {
    const day = now.subtract(1, 'day')
    return { start: day.startOf('day').unix(), end: day.endOf('day').unix() }
  }
  if (viewMode.value === 'week') {
    return { start: now.subtract(6, 'day').startOf('day').unix(), end: now.unix() }
  }
  if (viewMode.value === 'month') {
    return { start: now.subtract(29, 'day').startOf('day').unix(), end: now.unix() }
  }
  return { start: now.startOf('day').unix(), end: now.unix() }
})
const displayOrders = computed(() => {
  const { start, end } = displayRange.value
  return orders.value.filter((o) => o.create_time >= start && o.create_time <= end)
})

const sourceRefundedOrderMap = computed(() => {
  const map = new Map<string, { count: number; amount: number }>()
  for (const item of sourceAftersaleList.value) {
    if (!isSuccessfulAftersale(item) || !item.order_id) continue
    const orderId = String(item.order_id)
    const existing = map.get(orderId) || { count: 0, amount: 0 }
    existing.count += 1
    existing.amount += Number(item.amount || 0)
    map.set(orderId, existing)
  }
  return map
})

const orderStats = computed(() => {
  return calculateNetSales(displayOrders.value, rangeAftersaleList.value)
})
const displayRangeLabel = computed(() => {
  if (viewMode.value === 'custom' && customRange.value?.length === 2) {
    const [start, end] = customRange.value
    return `${dayjs(start).format('MM-DD')} 至 ${dayjs(end).format('MM-DD')}`
  }
  const labels: Record<WechatViewMode, string> = {
    today: '今天',
    yesterday: '昨天',
    week: '近7天',
    month: '近30天',
    current_month: '当月',
    custom: '自定义时段',
  }
  return labels[viewMode.value]
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

const sourceRanking = computed<SourceSummary[]>(() => {
  const map = new Map<string, SourceSummary>()
  for (const order of sourceAttributionOrders.value) {
    const source = sourceForAttribution(order)
    const key = sourceKeyForOrder(order)
    const refund = sourceRefundedOrderMap.value.get(String(order.order_id))
    const existing = map.get(key) || {
      key,
      name: source.account_nickname || source.account_id || '未知来源',
      accountType: source.account_type,
      saleChannel: source.sale_channel,
      orders: 0,
      gmv: 0,
      refundCount: 0,
      refundAmount: 0,
    }
    existing.orders += 1
    existing.gmv += Number(order.product_price || order.pay_amount || 0)
    if (refund) {
      existing.refundCount += 1
      existing.refundAmount += refund.amount
    }
    map.set(key, existing)
  }
  return Array.from(map.values()).sort(
    (a, b) => b.orders - a.orders || b.refundCount - a.refundCount || b.gmv - a.gmv,
  )
})

const sourceAttributionOrders = computed(() => {
  return displayOrders.value.filter((order) => isShippedForSource(order))
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
  return displayOrders.value.filter((o) =>
    [o.product_title, o.order_id, orderSourceLabel(o)].some((value) =>
      String(value || '')
        .toLowerCase()
        .includes(kw),
    ),
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
function isShippedForSource(order: WechatOrder) {
  return Number(order.ship_time || 0) > 0
}
function primaryOrderSource(order: WechatOrder): WechatOrderSourceInfo | null {
  return order.source_infos?.find((source) => source.account_nickname || source.account_id) || null
}
function sourceForAttribution(order: WechatOrder): WechatOrderSourceInfo {
  return (
    primaryOrderSource(order) || {
      account_type: 'store',
      account_id: `store:${activeStoreId.value}`,
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
function openSourceDetail(source: SourceSummary) {
  router.push({
    name: 'WechatSourceDetail',
    query: {
      store_id: activeStoreId.value,
      source_key: source.key,
      source_name: source.name,
      account_type: source.accountType,
      sale_channel: source.saleChannel,
    },
  })
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

function openCreateStore() {
  createStoreForm.value = { name: '', appId: '', appSecret: '' }
  showCreateStore.value = true
}

async function createStore() {
  const name = createStoreForm.value.name.trim()
  const appId = createStoreForm.value.appId.trim()
  const appSecret = createStoreForm.value.appSecret.trim()

  if (!name || !appId || !appSecret) {
    ElMessage.warning('请填写店铺名称、AppID 和 AppSecret')
    return
  }

  creatingStore.value = true
  try {
    const res = await wechatStoreApi.createStore({ name, appId, appSecret })
    const created = res.data
    ElMessage.success('微信小店已添加，正在同步数据')
    showCreateStore.value = false
    await loadStores()
    if (created?.id) activeStoreId.value = created.id
    await loadStoreData()
  } catch {
    /* handled by interceptor */
  } finally {
    creatingStore.value = false
  }
}

// ── API ──
function isSuccessfulAftersale(a: WechatAftersale) {
  return a.status === 'MERCHANT_REFUND_SUCCESS'
}

async function loadStores() {
  storesLoading.value = true
  try {
    const res = await wechatStoreApi.getStores()
    const list = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : []
    stores.value = list
    if (stores.value.length > 0 && !activeStoreId.value) activeStoreId.value = stores.value[0].id
  } catch (error: any) {
    stores.value = []
    activeStoreId.value = ''
    ElMessage.error(error?.message || '微信小店店铺加载失败，请重新登录后再试')
  } finally {
    storesLoaded.value = true
    storesLoading.value = false
  }
}

async function loadStoreData() {
  if (!activeStoreId.value) {
    clearStoreData()
    return
  }
  loading.value = true
  try {
    const { start, end } = displayRange.value
    const sourceRefundEnd = Math.max(end, Math.floor(Date.now() / 1000))
    const [ordRes, prodRes, afterRes, rangeAfterRes, sourceAfterRes, infoRes] = await Promise.all([
      wechatStoreApi.getOrders(activeStoreId.value, {
        page_size: 5000,
        start_time: start,
        end_time: end,
      }),
      wechatStoreApi.getProducts(activeStoreId.value, { page_size: 50 }),
      wechatStoreApi.getAftersaleCount?.(activeStoreId.value) || Promise.resolve(null),
      wechatStoreApi.getAftersaleCount?.(activeStoreId.value, {
        begin_create_time: start,
        end_create_time: end,
      }) || Promise.resolve(null),
      wechatStoreApi.getAftersaleCount?.(activeStoreId.value, {
        begin_create_time: start,
        end_create_time: sourceRefundEnd,
      }) || Promise.resolve(null),
      wechatStoreApi.getShopInfo?.(activeStoreId.value) || Promise.resolve(null),
    ])
    orders.value = ordRes.data?.errcode === 0 ? ordRes.data.order_list || [] : []
    products.value = prodRes.data?.errcode === 0 ? prodRes.data.products || [] : []
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
    if (sourceAfterRes?.data?.errcode === 0) {
      sourceAftersaleList.value = normalizeAftersales(
        (sourceAfterRes.data.list || []) as WechatAftersale[],
      )
    } else {
      sourceAftersaleList.value = rangeAftersaleList.value
    }
    shopInfo.value = infoRes?.data?.errcode === 0 ? infoRes.data.info || null : null
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
    gap: $space-3;
    flex-wrap: wrap;
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
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  &__store-select {
    width: 160px;
    flex-shrink: 0;
  }
  &__date-range {
    width: 240px;
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

  &__store-loading {
    min-height: 92px;
  }

  &__form-note {
    margin: $space-2 0 0 92px;
    color: $text-tertiary;
    font-size: $text-xs;
    line-height: 1.6;
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
    &__form-note {
      margin-left: 0;
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

.source-ranking {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: $space-3;
  padding: $space-5;

  @media (max-width: 1100px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }

  &__empty {
    padding: $space-6;
  }
}

.source-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $space-3;
  min-width: 0;
  padding: $space-4;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  background: rgba($bg-hover, 0.42);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;

  &:hover,
  &:focus-visible {
    border-color: rgba($accent-400, 0.72);
    background: rgba($accent-500, 0.1);
  }

  &:hover {
    transform: translateY(-1px);
  }

  &__main {
    min-width: 0;
  }
  &__name {
    font-size: $text-body;
    color: $text-primary;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    margin-top: 4px;
    font-size: $text-micro;
    color: $text-tertiary;
  }
  &__stats {
    display: grid;
    justify-items: end;
    gap: 2px;
    flex-shrink: 0;
    font-family: $font-mono;
    font-feature-settings: 'tnum' 1;

    strong {
      color: $text-primary;
      font-size: 18px;
      line-height: 1;
    }
    span,
    em,
    small {
      color: $text-tertiary;
      font-size: $text-micro;
      font-style: normal;
    }
    small {
      color: $color-danger;
      white-space: nowrap;
    }
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
    flex-wrap: wrap;
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
  &__source {
    margin-top: 4px;
    font-size: $text-micro;
    color: $accent-300;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
