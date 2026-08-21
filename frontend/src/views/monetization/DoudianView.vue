<template>
  <div class="doudian">
    <div class="doudian__header">
      <div>
        <h2 class="doudian__title">抖店</h2>
        <p class="doudian__subtitle">
          {{
            activeLocalStore
              ? `${activeLocalStore.name} · ${syncText}`
              : '本地伴侣采集，云端展示数据'
          }}
        </p>
      </div>
      <div class="doudian__actions">
        <el-radio-group v-model="viewMode" size="small">
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
          class="doudian__date-range"
        />
        <el-select
          v-if="localStores.length > 0"
          v-model="activeLocalStoreId"
          placeholder="选择店铺"
          size="small"
          class="doudian__store-select"
          @change="loadData"
        >
          <el-option
            v-for="store in localStores"
            :key="store.id"
            :label="store.name"
            :value="store.id"
          />
        </el-select>
        <el-select
          v-else
          v-model="activeCloudStoreId"
          placeholder="选择店铺"
          size="small"
          class="doudian__store-select"
          @change="loadData"
        >
          <el-option
            v-for="store in stores"
            :key="store.id"
            :label="store.name"
            :value="store.id"
          />
        </el-select>
        <el-button :icon="Refresh" circle size="small" :loading="loading" @click="refreshAll" />
        <el-button
          :type="syncing ? 'danger' : 'primary'"
          size="small"
          :disabled="usingCloudFallback || cancelingSync"
          :title="usingCloudFallback ? '桌面伴侣未连接，无法同步' : '同步抖店数据'"
          @click="syncing ? cancelSync() : syncActive()"
        >
          {{ cancelingSync ? '取消中' : syncing ? '取消同步' : '同步' }}
        </el-button>
        <el-popover v-if="!usingCloudFallback" placement="bottom-end" width="360" trigger="click">
          <template #reference>
            <el-button :icon="Setting" circle size="small" />
          </template>
          <div class="setup-panel">
            <div class="setup-panel__title">店铺设置</div>
            <el-input v-model="newStoreName" placeholder="店铺备注，可留空" />
            <div class="setup-panel__buttons">
              <el-button :loading="creatingStore" @click="createStore">添加并登录</el-button>
              <el-button :disabled="!activeLocalStoreId" @click="() => openLogin()"
                >打开登录</el-button
              >
              <el-button :disabled="!activeLocalStoreId" @click="checkCompanion"
                >检查伴侣</el-button
              >
              <el-button
                type="danger"
                plain
                :disabled="!activeLocalStoreId"
                @click="deleteActiveStore"
              >
                删除当前店铺
              </el-button>
            </div>
          </div>
        </el-popover>
      </div>
    </div>

    <div v-if="!companionReady && stores.length === 0" class="empty-hint doudian__empty-store">
      <p>桌面伴侣未启动，无法读取抖店店铺。</p>
      <el-button size="small" type="primary" @click="refreshAll">
        <el-icon><Refresh /></el-icon>重新检查
      </el-button>
    </div>

    <div
      v-else-if="!loading && localStores.length === 0 && stores.length === 0"
      class="empty-hint doudian__empty-store"
    >
      <p>暂无抖店店铺。点击右上角设置，添加店铺并登录一次。</p>
    </div>

    <el-alert
      v-if="storeAlertTitle"
      type="warning"
      closable
      :title="storeAlertTitle"
      class="doudian__alert"
    />

    <div class="doudian__kpi doudian__kpi--primary">
      <div class="kpi-card">
        <div class="kpi-card__label">{{ rangeSalesLabel }}</div>
        <div class="kpi-card__value">&yen;{{ centToYuan(orderStats.net) }}</div>
        <div class="kpi-card__sub">{{ orderStatsSub }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">售后退款</div>
        <div class="kpi-card__value kpi-card__value--danger">
          &yen;{{ centToYuan(rangeAftersaleAmount) }}
        </div>
        <div class="kpi-card__sub">{{ displayRefundAftersales.length }} 条退款记录</div>
      </div>
    </div>

    <div class="doudian__kpi doudian__kpi--status">
      <div v-for="item in statusBreakdown" :key="item.label" class="kpi-card kpi-card--sm">
        <div class="kpi-card__label">{{ item.label }}</div>
        <div class="kpi-card__value kpi-card__value--sm">{{ item.count }}</div>
      </div>
    </div>

    <div class="section-card">
      <div class="section-card__header" @click="showAftersale = !showAftersale">
        <span>售后/退款</span>
        <span class="section-card__meta">
          {{
            displayRefundAftersales.length > 0
              ? `${displayRefundAftersales.length} 条，合计 ¥${centToYuan(rangeAftersaleAmount)}`
              : '当前时段暂无售后'
          }}
          <span class="section-card__toggle">{{ showAftersale ? '收起' : '展开' }}</span>
        </span>
      </div>
      <div v-if="showAftersale" v-loading="loading" class="order-list">
        <div v-if="aftersales.length === 0" class="empty-hint">
          <p>暂无售后记录</p>
        </div>
        <div v-for="item in displayRefundAftersales.slice(0, 20)" :key="item.id" class="order-item">
          <div class="order-item__info">
            <div class="order-item__title">{{ item.product || '未知商品' }}</div>
            <div class="order-item__meta">
              <span>{{ fmtTime(item.create_time || 0) }}</span>
              <span class="order-item__status is-done">{{ aftersaleStatus(item) }}</span>
            </div>
          </div>
          <div class="order-item__price order-item__price--refund">
            -&yen;{{ centToYuan(item.amount || 0) }}
          </div>
        </div>
      </div>
    </div>

    <div class="section-card doudian__chart">
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
          {{ sourceRanking.length ? `${sourceRanking.length} 个来源账号` : '当前时段暂无来源' }}
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
            <div class="source-row__name" :title="source.name">{{ source.name }}</div>
            <div class="source-row__meta">
              <span>{{ source.isSelf ? '店铺本身出单' : '带货达人' }}</span>
              <span>{{ sourceSourceLabel(source.authorSource) }}</span>
              <span v-if="source.authorId">ID {{ shortAuthorId(source.authorId) }}</span>
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
        <p>当前时段订单暂未带出成交来源</p>
      </div>
    </div>

    <div class="doudian__grid">
      <div class="section-card">
        <div class="section-card__header">
          <span>最近订单</span>
          <div class="section-card__header-right">
            <el-input
              v-model="orderSearch"
              placeholder="搜索订单…"
              size="small"
              class="doudian__search-input"
              clearable
            />
            <span class="section-card__meta">{{ filteredOrders.length }} 条</span>
          </div>
        </div>
        <div v-loading="loading" class="order-list">
          <div v-if="filteredOrders.length === 0" class="empty-hint">
            <p>{{ orderSearch ? '无匹配订单' : '暂无订单' }}</p>
            <el-button v-if="!orderSearch" size="small" text type="primary" @click="syncActive">
              <el-icon><Refresh /></el-icon>同步数据
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
              <div v-if="orderSourceLabel(order)" class="order-item__source">
                成交来源：{{ orderSourceLabel(order) }}
              </div>
              <div class="order-item__meta">
                <span>{{ fmtTime(order.create_time) }}</span>
                <span class="order-item__status" :class="orderStatusClass(order)">
                  {{ orderStatus(order) }}
                </span>
                <span>订单 {{ order.order_id }}</span>
              </div>
            </div>
            <div class="order-item__price">&yen;{{ centToYuan(order.pay_amount || 0) }}</div>
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
            <el-button size="small" text type="primary" @click="syncActive">
              <el-icon><Refresh /></el-icon>同步商品
            </el-button>
          </div>
          <div v-for="product in sortedProducts" :key="product.product_id" class="product-card">
            <img
              v-if="product.img_url"
              :src="product.img_url"
              class="product-card__img"
              @error="hideImg"
            />
            <div class="product-card__info">
              <div class="product-card__title">{{ product.title || '未命名商品' }}</div>
              <div class="product-card__stats">
                <span class="product-card__price"
                  >&yen;{{ centToYuan(product.selling_price) }}</span
                >
                <span>已售 {{ fmtNum(product.sales) }}</span>
                <span>库存 {{ fmtNum(product.stock) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Setting } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import DataChart from '@/components/common/DataChart.vue'
import {
  doudianStoreApi,
  type DoudianCompanionStore,
  type DoudianStore,
  type DoudianSummary,
} from '@/api/doudian-store'
import { getCompanionUrl } from '@/composables/useCompanionUrl'
import { useUserStore } from '@/store/user'
import {
  buildDoudianStatusBreakdown,
  buildDoudianTrend,
  doudianAftersaleStatus,
  doudianOrderStatus,
  filterDoudianRefunds,
  getDoudianRevenueOrders,
  getDoudianSuccessfulRefundOrderIds,
  type DoudianAftersaleMetric,
  type DoudianOrderMetric,
} from '@/utils/doudianStoreMetrics'
import { readJsonOr } from '@/utils/http'

const stores = ref<DoudianStore[]>([])
const router = useRouter()
const localStores = ref<DoudianCompanionStore[]>([])
const activeLocalStoreId = ref('')
const activeCloudStoreId = ref('')
const loading = ref(false)
const syncing = ref(false)
const cancelingSync = ref(false)
const currentSyncJobId = ref('')
const creatingStore = ref(false)
const companionReady = ref(true)
const showAftersale = ref(false)
type DoudianViewMode = 'today' | 'yesterday' | 'week' | 'month' | 'current_month' | 'custom'

const viewMode = ref<DoudianViewMode>('today')
const trendMetric = ref<'gmv' | 'orders'>('gmv')
const orderSearch = ref('')
const newStoreName = ref('')
const orders = ref<DoudianOrderMetric[]>([])
const recentOrders = ref<DoudianOrderMetric[]>([])
const products = ref<any[]>([])
const aftersales = ref<DoudianAftersaleMetric[]>([])
const summary = ref<DoudianSummary | null>(null)
const lastLoadError = ref('')
const customRange = ref<[Date, Date] | null>(null)
const userStore = useUserStore()
let timer: ReturnType<typeof setInterval> | null = null

interface DoudianSourceSummary {
  key: string
  name: string
  authorId: string
  authorSource: string
  isSelf: boolean
  orders: number
  gmv: number
  refundCount: number
  refundAmount: number
}

const activeLocalStore = computed(() =>
  localStores.value.find((store) => store.id === activeLocalStoreId.value),
)
function normalizeDoudianStoreName(name?: string) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '')
}
const activeLocalCloudStore = computed(() => {
  const cloudStoreId = activeLocalStore.value?.cloud_store_id
  if (cloudStoreId) {
    const matchedById = stores.value.find((store) => store.id === cloudStoreId)
    if (matchedById) return matchedById
  }
  const localName = normalizeDoudianStoreName(activeLocalStore.value?.name)
  if (!localName) return null
  return stores.value.find((store) => normalizeDoudianStoreName(store.name) === localName) || null
})
const activeStoreId = computed(() => {
  if (activeLocalCloudStore.value) return activeLocalCloudStore.value.id
  if (localStores.value.length === 0 && stores.value.some((store) => store.id === activeCloudStoreId.value)) {
    return activeCloudStoreId.value
  }
  return ''
})
const activeStore = computed(() => stores.value.find((store) => store.id === activeStoreId.value))
const activeStoreDisplayName = computed(
  () => activeLocalStore.value?.name || activeStore.value?.name || '',
)
const usingCloudFallback = computed(() => localStores.value.length === 0 && stores.value.length > 0)
const hasCachedData = computed(
  () => orders.value.length > 0 || products.value.length > 0 || aftersales.value.length > 0,
)
const storeAlertTitle = computed(() => {
  if (lastLoadError.value && !hasCachedData.value) return lastLoadError.value
  const message = activeStore.value?.syncError || activeLocalStore.value?.last_error || ''
  if (!message) return ''
  if (hasCachedData.value) return ''
  return message
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
    return {
      start: now.subtract(7, 'day').startOf('day').unix(),
      end: now.subtract(1, 'day').endOf('day').unix(),
    }
  }
  if (viewMode.value === 'month') {
    return {
      start: now.subtract(30, 'day').startOf('day').unix(),
      end: now.subtract(1, 'day').endOf('day').unix(),
    }
  }
  return { start: now.startOf('day').unix(), end: now.unix() }
})
const backendSummary = computed(() => {
  const current = summary.value
  const range = displayRange.value
  if (!current) return null
  if (current.mode !== viewMode.value) return null
  if (current.range?.start !== range.start || current.range?.end !== range.end) return null
  return current
})
const displayOrders = computed(() => {
  const { start, end } = displayRange.value
  return orders.value.filter((order) => order.create_time >= start && order.create_time <= end)
})
const successfulRefundOrderIds = computed(() =>
  getDoudianSuccessfulRefundOrderIds(aftersales.value),
)
const revenueOrders = computed(() =>
  getDoudianRevenueOrders(displayOrders.value, successfulRefundOrderIds.value),
)
const revenueOrderIds = computed(
  () => new Set(revenueOrders.value.map((order) => String(order.order_id))),
)
const displayRefundAftersales = computed(() => {
  return filterDoudianRefunds(
    aftersales.value,
    displayRange.value,
    viewMode.value,
    revenueOrderIds.value,
  )
})
const rangeAftersaleAmount = computed(() =>
  displayRefundAftersales.value.reduce((sum, item) => sum + Number(item.amount || 0), 0),
)
const refundedOrderMap = computed(() => {
  const map = new Map<string, { count: number; amount: number }>()
  for (const item of displayRefundAftersales.value) {
    if (!item.order_id) continue
    const orderId = String(item.order_id)
    const existing = map.get(orderId) || { count: 0, amount: 0 }
    existing.count += 1
    existing.amount += Number(item.amount || 0)
    map.set(orderId, existing)
  }
  return map
})
const rangeSalesLabel = computed(() => {
  if (viewMode.value === 'custom') return `${displayRangeLabel.value}成交金额`
  if (viewMode.value === 'current_month') return '当月成交金额'
  if (viewMode.value === 'yesterday') return '昨天成交金额'
  if (viewMode.value === 'week') return '近7天成交金额'
  if (viewMode.value === 'month') return '近30天成交金额'
  return '今天成交金额'
})
const displayRangeLabel = computed(() => {
  if (viewMode.value === 'custom' && customRange.value?.length === 2) {
    const [start, end] = customRange.value
    return `${dayjs(start).format('MM-DD')} 至 ${dayjs(end).format('MM-DD')}`
  }
  const labels: Record<DoudianViewMode, string> = {
    today: '今天',
    yesterday: '昨天',
    week: '近7天',
    month: '近30天',
    current_month: '当月',
    custom: '自定义时段',
  }
  return labels[viewMode.value]
})
const orderStats = computed(() => {
  if (backendSummary.value) {
    const current = backendSummary.value
    return {
      gross: current.gross,
      refund: current.refund,
      net: current.net,
      count: current.count,
      effectiveCount: current.effectiveCount,
    }
  }
  const gross = revenueOrders.value.reduce((sum, order) => sum + Number(order.pay_amount || 0), 0)
  const refund = rangeAftersaleAmount.value
  return {
    gross,
    refund,
    net: Math.max(0, gross - refund),
    count: displayOrders.value.length,
    effectiveCount: revenueOrders.value.length,
  }
})
const orderStatsSub = computed(() => {
  const { count, effectiveCount } = orderStats.value
  if (count === 0) return '0 笔订单'
  const countText =
    effectiveCount === count ? `${count} 笔订单` : `${effectiveCount} 笔有效 / ${count} 笔总单`
  return countText
})
const syncText = computed(() => {
  if (usingCloudFallback.value && activeStore.value?.lastSyncedAt) {
    return `上次同步 ${dayjs(activeStore.value.lastSyncedAt).format('YYYY-MM-DD HH:mm:ss')}`
  }
  return activeLocalStore.value?.last_synced_at
    ? `上次同步 ${activeLocalStore.value.last_synced_at}`
    : '未同步'
})
const filteredOrders = computed(() => {
  const keyword = orderSearch.value.trim()
  if (!keyword) return recentOrders.value
  return recentOrders.value.filter((order) =>
    [order.order_id, order.product_title, orderSourceLabel(order), order.status].some((value) =>
      String(value || '').includes(keyword),
    ),
  )
})
const sortedProducts = computed(() =>
  [...products.value].sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0)).slice(0, 24),
)
const statusBreakdown = computed(() => {
  if (backendSummary.value) return backendSummary.value.statusBreakdown
  return buildDoudianStatusBreakdown(displayOrders.value, displayRefundAftersales.value.length)
})
const sourceRanking = computed<DoudianSourceSummary[]>(() => {
  const map = new Map<string, DoudianSourceSummary>()
  for (const order of displayOrders.value) {
    const shouldCountOrder = revenueOrderIds.value.has(String(order.order_id))
    const refund = refundedOrderMap.value.get(String(order.order_id))
    if (!shouldCountOrder && !refund) continue

    const name = String(order.author_name || '').trim()
    const authorId = String(order.author_id || '').trim()
    const isSelf = !name && !authorId

    const key = isSelf ? '__self_store__' : authorId || name
    const existing = map.get(key) || {
      key,
      name: isSelf ? activeStoreDisplayName.value || '店铺自卖' : name || authorId || '未知来源',
      authorId,
      authorSource: isSelf ? '小店自卖' : String(order.author_source || '').trim(),
      isSelf,
      orders: 0,
      gmv: 0,
      refundCount: 0,
      refundAmount: 0,
    }
    if (shouldCountOrder) {
      existing.orders += 1
      existing.gmv += Number(order.pay_amount || 0)
    }
    if (!existing.authorSource && order.author_source) {
      existing.authorSource = String(order.author_source).trim()
    }
    if (refund) {
      existing.refundCount += refund.count
      existing.refundAmount += refund.amount
    }
    map.set(key, existing)
  }
  return Array.from(map.values()).sort(
    (a, b) => b.gmv - a.gmv || b.orders - a.orders || b.refundCount - a.refundCount,
  )
})
const trendOption = computed(() => {
  const entries =
    backendSummary.value?.trend ||
    buildDoudianTrend(displayOrders.value, successfulRefundOrderIds.value)
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 55, right: 20, top: 20, bottom: 20 },
    xAxis: { type: 'category' as const, data: entries.map((item) => item.date) },
    yAxis: { type: 'value' as const },
    series: [
      {
        name: trendMetric.value === 'gmv' ? '销售额(元)' : '订单数',
        type: 'line' as const,
        smooth: true,
        areaStyle: { opacity: 0.15 },
        data: entries.map((item) =>
          trendMetric.value === 'orders' ? item.orders : item.gmv / 100,
        ),
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

function centToYuan(value: number) {
  return (Number(value || 0) / 100).toFixed(2)
}

function fmtNum(value: number) {
  return Number(value || 0).toLocaleString()
}

function fmtTime(value: number) {
  if (!value) return '-'
  return dayjs.unix(value).format('MM-DD HH:mm')
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

function aftersaleStatus(itemOrStatus: any) {
  return doudianAftersaleStatus(itemOrStatus)
}

function sourceSourceLabel(source: string) {
  const value = String(source || '').trim()
  return value || '联盟达人带货'
}

function orderSourceLabel(order: DoudianOrderMetric) {
  const name = String(order.author_name || '').trim()
  const authorId = String(order.author_id || '').trim()
  if (!name && !authorId) return `${activeStoreDisplayName.value || '店铺自卖'} · 小店自卖`
  return [name || authorId, sourceSourceLabel(String(order.author_source || ''))]
    .filter(Boolean)
    .join(' · ')
}

function shortAuthorId(authorId: string) {
  const id = String(authorId || '').trim()
  if (id.length <= 12) return id
  return `${id.slice(0, 6)}...${id.slice(-4)}`
}

function openSourceDetail(source: DoudianSourceSummary) {
  router.push({
    name: 'DoudianSourceDetail',
    query: {
      store_id: activeStoreId.value,
      source_key: source.key,
      source_name: source.name,
      author_id: source.authorId,
      author_source: source.authorSource,
      is_self: source.isSelf ? '1' : '0',
    },
  })
}

function hideImg(event: Event) {
  ;(event.target as HTMLImageElement).style.display = 'none'
}

function resolveApiUrl() {
  const raw = import.meta.env.VITE_API_BASE_URL || '/api/v1'
  if (/^https?:\/\//.test(raw)) return raw
  return `${window.location.origin}${raw}`
}

async function getRequiredCompanionUrl() {
  const companionUrl = await getCompanionUrl()
  if (!companionUrl) throw new Error('桌面伴侣未启动')
  return companionUrl
}

async function loadStores() {
  try {
    const res = await doudianStoreApi.getStores()
    stores.value = res.data || []
    if (localStores.value.length === 0 && !activeCloudStoreId.value && stores.value[0]) {
      activeCloudStoreId.value = stores.value[0].id
    }
  } catch (error) {
    console.error('[Doudian] load stores failed', error)
  }
}

async function loadLocalStores() {
  try {
    const companionUrl = await getCompanionUrl()
    companionReady.value = Boolean(companionUrl)
    if (!companionUrl) {
      localStores.value = []
      return
    }
    const resp = await fetch(`${companionUrl}/api/doudian/stores`)
    const data = await readJsonOr<any>(resp, {})
    localStores.value = data.data || []
    if (!activeLocalStoreId.value && localStores.value[0]) {
      activeLocalStoreId.value = localStores.value[0].id
    }
  } catch {
    companionReady.value = false
    localStores.value = []
  }
}

function clearDoudianData() {
  orders.value = []
  recentOrders.value = []
  products.value = []
  aftersales.value = []
  summary.value = null
}

async function loadData() {
  lastLoadError.value = ''
  if (!activeStoreId.value) {
    clearDoudianData()
    return
  }
  loading.value = true
  clearDoudianData()
  try {
    const range = displayRange.value
    const [orderRes, recentOrderRes, productRes, aftersaleRes] = await Promise.all([
      doudianStoreApi.getOrders(activeStoreId.value, {
        start_time: range.start,
        end_time: range.end,
      }),
      doudianStoreApi.getOrders(activeStoreId.value),
      doudianStoreApi.getProducts(activeStoreId.value),
      doudianStoreApi.getAftersales(activeStoreId.value, {
        begin_create_time: range.start,
        end_create_time: range.end,
      }),
    ])
    orders.value = orderRes.data?.order_list || []
    recentOrders.value = recentOrderRes.data?.order_list || orders.value
    products.value = productRes.data?.products || []
    aftersales.value = aftersaleRes.data?.list || []
    try {
      if (['today', 'yesterday', 'week', 'month'].includes(viewMode.value)) {
        const summaryRes = await doudianStoreApi.getSummary(activeStoreId.value, {
          start: range.start,
          end: range.end,
          mode: viewMode.value as DoudianSummary['mode'],
        })
        summary.value = summaryRes.data || null
      }
    } catch {
      summary.value = null
    }
  } catch (error: any) {
    clearDoudianData()
    console.error('[Doudian] load data failed', error)
    lastLoadError.value = error?.message || '抖店数据加载失败'
    ElMessage.error(lastLoadError.value)
  } finally {
    loading.value = false
  }
}

async function refreshAll() {
  try {
    await loadLocalStores()
    await loadStores()
    await loadData()
  } catch (error) {
    console.error('[Doudian] refresh failed', error)
  }
}

async function createStore() {
  creatingStore.value = true
  try {
    const companionUrl = await getRequiredCompanionUrl()
    const storeName = newStoreName.value.trim() || '新店铺'
    const resp = await fetch(`${companionUrl}/api/doudian/stores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: storeName,
        token: userStore.token,
        api_url: resolveApiUrl(),
      }),
    })
    const data = await readJsonOr<any>(resp, { code: -1, msg: '添加店铺失败' })
    if (!resp.ok || data.code !== 0) throw new Error(data.msg || '添加店铺失败')
    const nextStoreId = data.data?.id || ''
    newStoreName.value = ''
    activeLocalStoreId.value = nextStoreId || activeLocalStoreId.value
    await loadLocalStores()
    await loadStores()
    if (nextStoreId) {
      activeLocalStoreId.value = nextStoreId
      await openLogin(nextStoreId)
    }
    ElMessage.success('请在打开的抖店窗口扫码登录')
    await loadData()
  } catch (error: any) {
    ElMessage.error(error?.message || '添加店铺失败')
  } finally {
    creatingStore.value = false
  }
}

async function deleteActiveStore() {
  if (!activeLocalStore.value) {
    ElMessage.warning('请先选择店铺')
    return
  }
  try {
    const store = activeLocalStore.value
    await ElMessageBox.confirm(
      `确定删除「${store.name}」吗？会移除本机抖店登录目录和店铺绑定。`,
      '删除抖店店铺',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )
    const companionUrl = await getRequiredCompanionUrl()
    const resp = await fetch(`${companionUrl}/api/doudian/stores/${store.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: userStore.token,
        refreshToken: userStore.refreshToken,
        api_url: resolveApiUrl(),
      }),
    })
    const data = await readJsonOr<any>(resp, { code: -1, msg: '删除店铺失败' })
    if (!resp.ok || data.code !== 0) throw new Error(data.msg || '删除店铺失败')
    activeLocalStoreId.value = ''
    clearDoudianData()
    ElMessage.success('店铺已删除')
    await refreshAll()
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error?.message || '删除店铺失败')
  }
}

async function syncActive() {
  if (!activeLocalStoreId.value) {
    ElMessage.warning('请先选择店铺')
    return
  }
  if (!activeLocalStore.value) {
    ElMessage.warning('当前本地店铺不存在，请刷新后重试')
    return
  }
  try {
    await ElMessageBox.confirm(`即将同步该店铺的抖店数据，请确保已成功登录。`, '确认同步抖店', {
      type: 'warning',
      confirmButtonText: '确认同步',
      cancelButtonText: '取消',
    })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    throw error
  }
  syncing.value = true
  currentSyncJobId.value = ''
  try {
    const companionUrl = await getRequiredCompanionUrl()
    if (userStore.refreshToken) {
      await userStore.doRefreshToken()
    }
    const resp = await fetch(
      `${companionUrl}/api/doudian/stores/${activeLocalStoreId.value}/sync`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: userStore.token,
          refreshToken: userStore.refreshToken,
          api_url: resolveApiUrl(),
        }),
      },
    )
    const started = await readJsonOr<any>(resp, { code: -1, msg: '同步启动失败' })
    if (!resp.ok || started.code !== 0) throw new Error(started.msg || '同步启动失败')
    if (!started.job_id) throw new Error('桌面伴侣未返回同步任务编号，请重试')
    currentSyncJobId.value = started.job_id || ''
    ElMessage.info('抖店同步已开始，请保持桌面伴侣运行')
    const data = await waitCompanionJob(companionUrl, started.job_id)
    ElMessage.success(
      `同步完成：订单 ${data?.ordersSaved || 0}，商品 ${data?.productsSaved || 0}，售后 ${
        data?.aftersalesSaved || 0
      }`,
    )
    await loadLocalStores()
    await loadStores()
    await loadData()
  } catch (error: any) {
    const message = error?.message || '同步失败'
    if (message.includes('取消')) ElMessage.info(message)
    else ElMessage.error(message)
  } finally {
    syncing.value = false
    cancelingSync.value = false
    currentSyncJobId.value = ''
  }
}

async function cancelSync() {
  if (!currentSyncJobId.value) {
    ElMessage.warning('同步任务还在启动，请稍后再取消')
    return
  }
  cancelingSync.value = true
  try {
    const companionUrl = await getRequiredCompanionUrl()
    const resp = await fetch(`${companionUrl}/api/doudian/jobs/${currentSyncJobId.value}/cancel`, {
      method: 'POST',
    })
    const data = await readJsonOr<any>(resp, { code: -1, msg: '取消失败' })
    if (!resp.ok || data.code !== 0) throw new Error(data.msg || '取消失败')
    ElMessage.info('正在取消抖店同步')
  } catch (error: any) {
    cancelingSync.value = false
    ElMessage.error(error?.message || '取消失败')
  }
}

async function openLogin(storeId = activeLocalStoreId.value) {
  if (!storeId) return
  const store = localStores.value.find((item) => item.id === storeId)
  if (store) {
    try {
      await ElMessageBox.confirm(
        `即将打开抖店登录窗口，请在弹出的浏览器中扫码登录。登录成功后系统会自动获取店铺名称。`,
        '确认打开登录',
        {
          type: 'warning',
          confirmButtonText: '打开登录',
          cancelButtonText: '取消',
        },
      )
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
      throw error
    }
  }
  try {
    const companionUrl = await getRequiredCompanionUrl()
    const resp = await fetch(`${companionUrl}/api/doudian/stores/${storeId}/login`, {
      method: 'POST',
    })
    const data = await readJsonOr<any>(resp, { code: -1, msg: '打开登录失败' })
    if (!resp.ok || data.code !== 0) throw new Error(data.msg || '打开登录失败')
    ElMessage.success('已打开抖店登录窗口')
  } catch (error: any) {
    ElMessage.error(error?.message || '打开登录失败')
  }
}

async function checkCompanion() {
  try {
    const companionUrl = await getRequiredCompanionUrl()
    const resp = await fetch(`${companionUrl}/health`)
    const data = await readJsonOr<any>(resp, { status: '' })
    ElMessage[data.status === 'ok' ? 'success' : 'warning'](
      data.status === 'ok' ? '桌面伴侣已连接' : '桌面伴侣状态异常',
    )
  } catch (error: any) {
    ElMessage.error(error?.message || '桌面伴侣状态异常')
  }
}

async function waitCompanionJob(companionUrl: string, jobId: string) {
  for (let i = 0; i < 900; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const resp = await fetch(`${companionUrl}/api/doudian/jobs/${jobId}`)
    const data = await readJsonOr<any>(resp, { code: -1, msg: '同步状态读取失败' })
    if (!resp.ok || data.code !== 0) throw new Error(data.msg || '同步状态读取失败')
    const job = data.data || {}
    if (job.status === 'success') return job.result || {}
    if (job.status === 'canceled') throw new Error(job.message || '同步已取消')
    if (job.status === 'error') throw new Error(job.message || '同步失败')
  }
  throw new Error('同步仍在进行中，请稍后刷新数据')
}

watch(activeLocalStoreId, () => {
  void loadData()
})
watch(activeCloudStoreId, () => {
  void loadData()
})
watch(viewMode, () => {
  void loadData()
})
watch(customRange, () => {
  if (viewMode.value === 'custom') void loadData()
})
onMounted(async () => {
  await refreshAll()
  timer = setInterval(() => {
    void refreshAll()
  }, 60_000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped lang="scss">
.doudian {
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
    gap: $space-4;
  }

  &__title {
    margin: 0;
    color: $text-primary;
    font-size: $text-h1;
    font-weight: 600;
  }

  &__subtitle {
    margin: $space-1 0 0;
    color: $text-tertiary;
    font-size: $text-sm;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: $space-2;
    flex-wrap: wrap;
  }

  &__store-select {
    width: 190px;
  }

  &__date-range {
    width: 240px;
  }

  &__search-input {
    width: 160px;
  }

  &__alert {
    margin-bottom: 0;
  }

  &__empty-store {
    text-align: center;
  }

  &__kpi {
    display: grid;
    gap: $space-4;

    &--primary {
      grid-template-columns: repeat(2, 1fr);
    }

    &--status {
      grid-template-columns: repeat(5, 1fr);
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

  @media (max-width: 960px) {
    &__header {
      align-items: flex-start;
      flex-direction: column;
    }

    &__kpi--primary,
    &__grid {
      grid-template-columns: 1fr;
    }

    &__kpi--status {
      grid-template-columns: repeat(3, 1fr);
    }
  }
}

.setup-panel {
  display: flex;
  flex-direction: column;
  gap: $space-3;

  &__title {
    font-weight: 600;
    color: $text-primary;
  }

  &__buttons {
    display: flex;
    gap: $space-2;
  }
}

.kpi-card,
.section-card {
  @include card;
}

.kpi-card {
  padding: $space-5 $space-4;

  &--sm {
    padding: $space-3;
  }

  &__label {
    color: $text-tertiary;
    font-size: $text-xs;
    font-weight: 500;
    margin-bottom: $space-2;
  }

  &__value {
    color: $text-primary;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.1;

    &--danger {
      color: var(--el-color-danger);
    }

    &--sm {
      font-size: 20px;
    }
  }

  &__sub {
    color: $text-tertiary;
    font-size: $text-xs;
    margin-top: $space-2;
  }
}

.section-card {
  overflow: hidden;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: $space-3;
    padding: $space-4 $space-5;
    border-bottom: 1px solid var(--el-border-color-lighter);
    color: $text-primary;
    font-weight: 600;
    cursor: default;
  }

  &__header-right {
    display: flex;
    align-items: center;
    gap: $space-2;
  }

  &__meta,
  &__toggle {
    color: $text-tertiary;
    font-size: $text-xs;
    font-weight: 400;
  }

  &__toggle {
    color: var(--el-color-primary);
    margin-left: $space-2;
  }
}

.order-list {
  min-height: 180px;
  max-height: 620px;
  overflow: auto;
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: $space-3;
  min-width: 0;
  min-height: 118px;
  padding: $space-4;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: $radius-md;
  background: var(--el-fill-color-extra-light);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    transform 0.16s ease;

  &:hover,
  &:focus-visible {
    border-color: var(--el-color-primary-light-3);
    background: var(--el-color-primary-light-9);
  }

  &:hover {
    transform: translateY(-1px);
  }

  &__main {
    min-width: 0;
  }

  &__name {
    color: $text-primary;
    font-size: $text-sm;
    font-weight: 600;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    margin-top: 4px;
    color: $text-tertiary;
    font-size: $text-xs;

    span {
      max-width: 100%;
      overflow-wrap: anywhere;
    }
  }

  &__stats {
    display: grid;
    justify-items: end;
    gap: 2px;
    flex-shrink: 0;
    min-width: 72px;
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
      font-size: $text-xs;
      font-style: normal;
    }

    small {
      color: var(--el-color-danger);
      white-space: nowrap;
    }
  }
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

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    margin-top: 4px;
    color: $text-tertiary;
    font-size: $text-xs;
  }

  &__source {
    margin-top: 4px;
    color: var(--el-color-primary);
    font-size: $text-xs;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__status {
    color: var(--el-color-warning);

    &.is-paid,
    &.is-done {
      color: var(--el-color-success);
    }

    &.is-muted {
      color: $text-tertiary;
    }
  }

  &__price {
    color: $text-primary;
    font-weight: 600;
    white-space: nowrap;

    &--refund {
      color: var(--el-color-danger);
    }
  }
}

.product-grid {
  min-height: 180px;
  max-height: 620px;
  overflow: auto;
  padding: $space-3;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $space-3;
}

.product-card {
  display: flex;
  gap: $space-3;
  min-width: 0;
  padding: $space-3;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: $radius-md;
  background: var(--el-bg-color);

  &__img {
    width: 52px;
    height: 52px;
    flex: 0 0 52px;
    border-radius: $radius-md;
    object-fit: cover;
    background: var(--el-fill-color-light);
  }

  &__info {
    min-width: 0;
  }

  &__title {
    color: $text-primary;
    font-size: $text-sm;
    font-weight: 500;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  &__stats {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    margin-top: $space-2;
    color: $text-tertiary;
    font-size: $text-xs;
  }

  &__price {
    color: var(--el-color-danger);
    font-weight: 600;
  }
}

.empty-hint {
  padding: $space-8 $space-4;
  color: $text-tertiary;
  font-size: $text-sm;

  p {
    margin: 0 0 $space-3;
  }
}
</style>
