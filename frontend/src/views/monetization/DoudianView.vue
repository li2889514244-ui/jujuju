﻿<template>
  <div class="doudian">
    <div class="doudian__header">
      <div>
        <h2 class="doudian__title">抖店</h2>
        <p class="doudian__subtitle">
          {{ activeLocalStore ? `${activeLocalStore.name} · ${syncText}` : '本地伴侣采集，云端展示数据' }}
        </p>
      </div>
      <div class="doudian__actions">
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="today">今天</el-radio-button>
          <el-radio-button value="yesterday">昨天</el-radio-button>
          <el-radio-button value="week">近7天</el-radio-button>
        </el-radio-group>
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
        <el-button v-if="!usingCloudFallback" type="primary" size="small" :loading="syncing" @click="syncActive">
          同步
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
              <el-button :disabled="!activeLocalStoreId" @click="() => openLogin()">打开登录</el-button>
              <el-button :disabled="!activeLocalStoreId" @click="checkCompanion">检查伴侣</el-button>
              <el-button type="danger" plain :disabled="!activeLocalStoreId" @click="deleteActiveStore">
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

    <div v-else-if="!loading && localStores.length === 0 && stores.length === 0" class="empty-hint doudian__empty-store">
      <p>暂无抖店店铺。点击右上角设置，添加店铺并登录一次。</p>
    </div>

    <el-alert
      v-if="storeAlertTitle"
      type="warning"
      :closable="false"
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
        <div class="kpi-card__sub">{{ displayAftersales.length }} 条售后记录</div>
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
            displayAftersales.length > 0
              ? `${displayAftersales.length} 条，合计 ¥${centToYuan(rangeAftersaleAmount)}`
              : '当前时段暂无售后'
          }}
          <span class="section-card__toggle">{{ showAftersale ? '收起' : '展开' }}</span>
        </span>
      </div>
      <div v-if="showAftersale" v-loading="loading" class="order-list">
        <div v-if="aftersales.length === 0" class="empty-hint">
          <p>暂无售后记录</p>
        </div>
        <div v-for="item in displayAftersales.slice(0, 20)" :key="item.id" class="order-item">
          <div class="order-item__info">
            <div class="order-item__title">{{ item.product || '未知商品' }}</div>
            <div class="order-item__meta">
              <span>{{ fmtTime(item.create_time) }}</span>
              <span class="order-item__status is-done">{{ aftersaleStatus(item) }}</span>
            </div>
          </div>
          <div class="order-item__price order-item__price--refund">
            -&yen;{{ centToYuan(item.amount) }}
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
          <div v-for="order in filteredOrders.slice(0, 20)" :key="order.order_id" class="order-item">
            <img
              v-if="order.product_img"
              :src="order.product_img"
              class="order-item__img"
              @error="hideImg"
            />
            <div class="order-item__info">
              <div class="order-item__title">{{ order.product_title || '未知商品' }}</div>
              <div class="order-item__meta">
                <span>{{ fmtTime(order.create_time) }}</span>
                <span class="order-item__status" :class="orderStatusClass(order)">
                  {{ orderStatus(order) }}
                </span>
                <span>订单 {{ order.order_id }}</span>
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
                <span class="product-card__price">&yen;{{ centToYuan(product.selling_price) }}</span>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Setting } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import DataChart from '@/components/common/DataChart.vue'
import {
  doudianStoreApi,
  type DoudianCompanionStore,
  type DoudianStore,
} from '@/api/doudian-store'
import { getCompanionUrl } from '@/composables/useCompanionUrl'
import { useUserStore } from '@/store/user'

const stores = ref<DoudianStore[]>([])
const localStores = ref<DoudianCompanionStore[]>([])
const activeLocalStoreId = ref('')
const activeCloudStoreId = ref('')
const loading = ref(false)
const syncing = ref(false)
const creatingStore = ref(false)
const companionReady = ref(true)
const showAftersale = ref(false)
const viewMode = ref<'today' | 'yesterday' | 'week'>('today')
const trendMetric = ref<'gmv' | 'orders'>('gmv')
const orderSearch = ref('')
const newStoreName = ref('')
const orders = ref<any[]>([])
const products = ref<any[]>([])
const aftersales = ref<any[]>([])
const userStore = useUserStore()
let timer: ReturnType<typeof setInterval> | null = null

const activeLocalStore = computed(() =>
  localStores.value.find((store) => store.id === activeLocalStoreId.value),
)
const activeStoreId = computed(() => {
  if (activeLocalStore.value?.cloud_store_id) return activeLocalStore.value.cloud_store_id
  if (localStores.value.length === 0 && activeCloudStoreId.value) return activeCloudStoreId.value
  return ''
})
const activeStore = computed(() => stores.value.find((store) => store.id === activeStoreId.value))
const usingCloudFallback = computed(() => localStores.value.length === 0 && stores.value.length > 0)
const hasCachedData = computed(() => orders.value.length > 0 || products.value.length > 0 || aftersales.value.length > 0)
const storeAlertTitle = computed(() => {
  const message = activeStore.value?.syncError || activeLocalStore.value?.last_error || ''
  if (!message) return ''
  if (hasCachedData.value) return ''
  return message
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
  return orders.value.filter((order) => order.create_time >= start && order.create_time <= end)
})
const displayAftersales = computed(() => {
  const { start, end } = displayRange.value
  return aftersales.value.filter((item) => item.create_time >= start && item.create_time <= end)
})
const rangeAftersaleAmount = computed(() =>
  displayAftersales.value.reduce((sum, item) => sum + Number(item.amount || 0), 0),
)
const rangeSalesLabel = computed(() => {
  if (viewMode.value === 'yesterday') return '昨天净销售额'
  if (viewMode.value === 'week') return '近7天净销售额'
  return '今天净销售额'
})
const orderStats = computed(() => {
  const gross = displayOrders.value.reduce((sum, order) => {
    if (isClosedOrder(order)) return sum
    return sum + Number(order.pay_amount || 0)
  }, 0)
  const closedOrderIds = new Set(
    displayOrders.value.filter((order) => isClosedOrder(order)).map((order) => String(order.order_id)),
  )
  const refund = displayAftersales.value.reduce((sum, item) => {
    if (closedOrderIds.has(String(item.order_id || ''))) return sum
    return sum + Number(item.amount || 0)
  }, 0)
  const effectiveCount = displayOrders.value.filter((order) => !isClosedOrder(order)).length
  return {
    gross,
    refund,
    net: Math.max(0, gross - refund),
    count: displayOrders.value.length,
    effectiveCount,
  }
})
const orderStatsSub = computed(() => {
  const { count, effectiveCount, refund } = orderStats.value
  if (count === 0) return '0 笔订单'
  const countText = effectiveCount === count ? `${count} 笔有效订单` : `${effectiveCount} 笔有效 / ${count} 笔总单`
  return refund > 0 ? `${countText}，已扣 ¥${centToYuan(refund)}` : countText
})
const syncText = computed(() => {
  if (usingCloudFallback.value && activeStore.value?.lastSyncedAt) {
    return `上次同步 ${dayjs(activeStore.value.lastSyncedAt).format('YYYY-MM-DD HH:mm:ss')}`
  }
  return activeLocalStore.value?.last_synced_at ? `上次同步 ${activeLocalStore.value.last_synced_at}` : '未同步'
})
const filteredOrders = computed(() => {
  const keyword = orderSearch.value.trim()
  if (!keyword) return displayOrders.value
  return displayOrders.value.filter((order) =>
    [order.order_id, order.product_title, order.status].some((value) =>
      String(value || '').includes(keyword),
    ),
  )
})
const sortedProducts = computed(() =>
  [...products.value].sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0)).slice(0, 24),
)
const statusBreakdown = computed(() => {
  const labels = ['待发货', '已发货', '已完成', '已关闭', '售后']
  const buckets = new Map(labels.map((label) => [label, 0]))
  for (const order of displayOrders.value) {
    const label = orderStatus(order)
    buckets.set(label, (buckets.get(label) || 0) + 1)
  }
  buckets.set('售后', displayAftersales.value.length)
  return Array.from(buckets, ([label, count]) => ({ label, count }))
})
const trendOption = computed(() => {
  const grossByDate = new Map<string, number>()
  const ordersByDate = new Map<string, number>()
  const refundByDate = new Map<string, number>()
  const dates = new Set<string>()
  const closedOrderIds = new Set<string>()
  displayOrders.value.forEach((order) => {
    const date = dayjs.unix(order.create_time).format('MM-DD')
    dates.add(date)
    ordersByDate.set(date, (ordersByDate.get(date) || 0) + 1)
    if (!isClosedOrder(order)) {
      grossByDate.set(date, (grossByDate.get(date) || 0) + Number(order.pay_amount || 0))
    } else {
      closedOrderIds.add(String(order.order_id))
    }
  })
  displayAftersales.value.forEach((item) => {
    if (closedOrderIds.has(String(item.order_id || ''))) return
    const date = dayjs.unix(item.create_time).format('MM-DD')
    dates.add(date)
    refundByDate.set(date, (refundByDate.get(date) || 0) + Number(item.amount || 0))
  })
  const entries = [...dates].sort().map((date) => ({
    date,
    gmv: Math.max(0, (grossByDate.get(date) || 0) - (refundByDate.get(date) || 0)),
    orders: ordersByDate.get(date) || 0,
  }))
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
        data: entries.map((item) => (trendMetric.value === 'orders' ? item.orders : item.gmv / 100)),
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
  const text = typeof orderOrStatus === 'object' ? orderOrStatus.status_text : ''
  if (text) return text
  const code = Number(typeof orderOrStatus === 'object' ? orderOrStatus.status : orderOrStatus)
  if (code === 2) return '待发货'
  if (code === 3) return '已发货'
  if (code === 4) return '已关闭'
  if (code === 5 || code === 21) return '已关闭'
  return '待处理'
}

function isClosedOrder(orderOrStatus: any) {
  const label = orderStatus(orderOrStatus)
  return label.includes('关闭') || label.includes('取消') || label.includes('退款')
}

function orderStatusClass(orderOrStatus: any) {
  const label = orderStatus(orderOrStatus)
  if (label.includes('完成') || label.includes('发货')) return 'is-done'
  if (label.includes('关闭') || label.includes('取消') || label.includes('退款')) return 'is-muted'
  if (label.includes('支付') || label.includes('待发货')) return 'is-paid'
  return 'is-pending'
}

function aftersaleStatus(itemOrStatus: any) {
  const text = typeof itemOrStatus === 'object' ? itemOrStatus.status_text : ''
  if (text) return text
  const code = Number(typeof itemOrStatus === 'object' ? itemOrStatus.status : itemOrStatus)
  if ([6, 12, 27].includes(code)) return '已退款'
  if ([1, 2, 3].includes(code)) return '处理中'
  if ([7, 28].includes(code)) return '已关闭'
  return '售后'
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
  const res = await doudianStoreApi.getStores()
  stores.value = res.data || []
  if (localStores.value.length === 0 && !activeCloudStoreId.value && stores.value[0]) {
    activeCloudStoreId.value = stores.value[0].id
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
    const data = await resp.json()
    localStores.value = data.data || []
    if (!activeLocalStoreId.value && localStores.value[0]) {
      activeLocalStoreId.value = localStores.value[0].id
    }
  } catch {
    companionReady.value = false
    localStores.value = []
  }
}

async function loadData() {
  if (!activeStoreId.value) {
    orders.value = []
    products.value = []
    aftersales.value = []
    return
  }
  loading.value = true
  try {
    const [orderRes, productRes, aftersaleRes] = await Promise.all([
      doudianStoreApi.getOrders(activeStoreId.value),
      doudianStoreApi.getProducts(activeStoreId.value),
      doudianStoreApi.getAftersales(activeStoreId.value),
    ])
    orders.value = orderRes.data?.order_list || []
    products.value = orderRes.data ? productRes.data?.products || [] : []
    aftersales.value = aftersaleRes.data?.list || []
  } finally {
    loading.value = false
  }
}

async function refreshAll() {
  await loadLocalStores()
  await loadStores()
  await loadData()
}

async function createStore() {
  creatingStore.value = true
  try {
    const companionUrl = await getRequiredCompanionUrl()
    const storeName = newStoreName.value.trim() || `抖店-${new Date().toLocaleString()}`
    const resp = await fetch(`${companionUrl}/api/doudian/stores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: storeName,
        token: userStore.token,
        api_url: resolveApiUrl(),
      }),
    })
    const data = await resp.json()
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
    ElMessage.success('店铺已添加，请在打开的抖店窗口扫码登录')
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
  const data = await resp.json()
  if (!resp.ok || data.code !== 0) throw new Error(data.msg || '删除店铺失败')
  activeLocalStoreId.value = ''
  orders.value = []
  products.value = []
  aftersales.value = []
  ElMessage.success('店铺已删除')
  await refreshAll()
}

async function syncActive() {
  if (!activeLocalStoreId.value) {
    ElMessage.warning('请先选择店铺')
    return
  }
  syncing.value = true
  try {
    const companionUrl = await getRequiredCompanionUrl()
    if (userStore.refreshToken) {
      await userStore.doRefreshToken()
    }
    const resp = await fetch(`${companionUrl}/api/doudian/stores/${activeLocalStoreId.value}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: userStore.token,
        refreshToken: userStore.refreshToken,
        api_url: resolveApiUrl(),
      }),
    })
    const started = await resp.json()
    if (!resp.ok || started.code !== 0) throw new Error(started.msg || '同步启动失败')
    const data = await waitCompanionJob(companionUrl, started.job_id)
    ElMessage.success(
      `同步完成：订单 ${data?.ordersSaved || 0}，商品 ${data?.productsSaved || 0}，售后 ${
        data?.aftersalesSaved || 0
      }`,
    )
    await refreshAll()
  } catch (error: any) {
    ElMessage.error(error?.message || '同步失败')
  } finally {
    syncing.value = false
  }
}

async function openLogin(storeId = activeLocalStoreId.value) {
  if (!storeId) return
  const companionUrl = await getRequiredCompanionUrl()
  const resp = await fetch(`${companionUrl}/api/doudian/stores/${storeId}/login`, {
    method: 'POST',
  })
  const data = await resp.json()
  if (!resp.ok || data.code !== 0) throw new Error(data.msg || '打开登录失败')
  ElMessage.success('已打开抖店登录窗口')
}

async function checkCompanion() {
  const companionUrl = await getRequiredCompanionUrl()
  const resp = await fetch(`${companionUrl}/health`)
  const data = await resp.json()
  ElMessage[data.status === 'ok' ? 'success' : 'warning'](
    data.status === 'ok' ? '桌面伴侣已连接' : '桌面伴侣状态异常',
  )
}

async function waitCompanionJob(companionUrl: string, jobId: string) {
  for (let i = 0; i < 90; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const resp = await fetch(`${companionUrl}/api/doudian/jobs/${jobId}`)
    const data = await resp.json()
    const job = data.data || {}
    if (job.status === 'success') return job.result || {}
    if (job.status === 'error') throw new Error(job.message || '同步失败')
  }
  throw new Error('同步超时')
}

watch(activeLocalStoreId, () => loadData())
watch(activeCloudStoreId, () => loadData())

onMounted(async () => {
  await refreshAll()
  timer = setInterval(refreshAll, 60_000)
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
  }

  &__store-select {
    width: 190px;
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
