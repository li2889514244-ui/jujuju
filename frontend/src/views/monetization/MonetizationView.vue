<template>
  <div class="monetization">
    <div class="monetization__header">
      <h2 class="monetization__title">微信小店</h2>
      <div class="monetization__actions">
        <el-select v-model="activeStoreId" placeholder="选择店铺" size="small" style="width:160px" @change="loadStoreData">
          <el-option v-for="s in stores" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
        <el-button :icon="Refresh" circle size="small" :loading="loading" @click="loadStoreData" />
      </div>
    </div>

    <!-- Shop Info -->
    <div class="shop-info" v-if="shopInfo">
      <img v-if="shopInfo.headimg_url" :src="shopInfo.headimg_url" class="shop-info__avatar" @error="hideImg" />
      <div>
        <div class="shop-info__name">{{ shopInfo.nickname }}</div>
        <div class="shop-info__meta">{{ shopInfo.subject_type }} · 已开通</div>
      </div>
    </div>

    <!-- KPI -->
    <div class="monetization__kpi">
      <div class="kpi-card">
        <div class="kpi-card__label">近7天销售额</div>
        <div class="kpi-card__value">&yen;{{ centToYuan(orderStats.gmv) }}</div>
        <div class="kpi-card__sub">{{ orderStats.count }} 笔订单</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">平均客单价</div>
        <div class="kpi-card__value">&yen;{{ centToYuan(orderStats.avg) }}</div>
        <div class="kpi-card__sub">每笔订单平均金额</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">售后退款</div>
        <div class="kpi-card__value">{{ aftersaleCount }}</div>
        <div class="kpi-card__sub">近 24 小时申请</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">在售商品</div>
        <div class="kpi-card__value">{{ productStats.inStock }} / {{ productStats.total }}</div>
        <div class="kpi-card__sub">全部已售 {{ fmtNum(productStats.totalSales) }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">总库存</div>
        <div class="kpi-card__value">{{ fmtNum(productStats.totalStock) }}</div>
        <div class="kpi-card__sub">件</div>
      </div>
    </div>

    <!-- Order Status -->
    <div class="monetization__kpi" style="grid-template-columns: repeat(5, 1fr)">
      <div v-for="s in statusBreakdown" :key="s.label" class="kpi-card kpi-card--sm">
        <div class="kpi-card__label">{{ s.label }}</div>
        <div class="kpi-card__value kpi-card__value--sm">{{ s.count }}</div>
      </div>
    </div>

    <!-- Trend -->
    <div class="monetization__chart card">
      <div class="card__header">
        <span>近7天销售趋势</span>
        <el-radio-group v-model="trendMetric" size="small">
          <el-radio-button value="gmv">销售额</el-radio-button>
          <el-radio-button value="orders">订单数</el-radio-button>
        </el-radio-group>
      </div>
      <DataChart :option="trendOption" :height="260" />
    </div>

    <!-- Orders + Products -->
    <div class="monetization__grid">
      <div class="card">
        <div class="card__header">
          <span>最近订单</span>
          <span class="card__count">{{ orders.length }} 条</span>
        </div>
        <div v-loading="loading" class="order-list">
          <div v-if="orders.length === 0" class="empty-hint">暂无订单</div>
          <div v-for="order in orders.slice(0, 20)" :key="order.order_id" class="order-item">
            <img v-if="order.product_img" :src="order.product_img" class="order-item__img" @error="hideImg" />
            <div class="order-item__info">
              <div class="order-item__title">{{ order.product_title || '未知商品' }}</div>
              <div class="order-item__meta">
                <span class="order-item__time">{{ fmtTime(order.create_time) }}</span>
                <span class="order-item__status" :class="statusClass(order.status)">{{ statusLabel(order.status) }}</span>
              </div>
            </div>
            <div class="order-item__price">&yen;{{ centToYuan(order.pay_amount) }}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__header">
          <span>商品列表</span>
          <span class="card__count">{{ products.length }} 件</span>
        </div>
        <div v-loading="loading" class="product-grid">
          <div v-if="products.length === 0" class="empty-hint">暂无商品</div>
          <div v-for="prod in sortedProducts" :key="prod.product_id" class="product-card">
            <img v-if="prod.img_url" :src="prod.img_url" class="product-card__img" @error="hideImg" />
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
import DataChart from '@/components/common/DataChart.vue'
import { wechatStoreApi, type WechatOrder, type WechatProduct, type WechatStore } from '@/api/wechat-store'
import dayjs from 'dayjs'

const loading = ref(false)
const trendMetric = ref('gmv')
const stores = ref<WechatStore[]>([])
const activeStoreId = ref('')
const orders = ref<WechatOrder[]>([])
const products = ref<WechatProduct[]>([])
const aftersaleCount = ref(0)
const shopInfo = ref<{ nickname: string; headimg_url: string; subject_type: string } | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

// ── Stats ──

const orderStats = computed(() => {
  const gmv = orders.value.reduce((s, o) => s + o.pay_amount, 0)
  const c = orders.value.length
  return { gmv, count: c, avg: c > 0 ? gmv / c : 0 }
})

const productStats = computed(() => ({
  total: products.value.length,
  inStock: products.value.filter((p) => p.status !== 2 && p.stock > 0).length,
  totalSales: products.value.reduce((s, p) => s + p.sales, 0),
  totalStock: products.value.reduce((s, p) => s + p.stock, 0),
}))

const statusBreakdown = computed(() => {
  const labels: Record<number, string> = { 10: '待付款', 20: '待发货', 30: '待收货', 100: '已完成', 250: '已取消' }
  const groups: Record<number, number> = {}
  orders.value.forEach((o) => { groups[o.status] = (groups[o.status] || 0) + 1 })
  return [10, 20, 30, 100, 250].map((k) => ({ label: labels[k], count: groups[k] || 0 }))
})

const sortedProducts = computed(() => [...products.value].sort((a, b) => b.sales - a.sales))

const trendOption = computed(() => {
  const dailyMap: Record<string, { gmv: number; orders: number }> = {}
  orders.value.forEach((o) => {
    const d = dayjs.unix(o.create_time).format('MM-DD')
    if (!dailyMap[d]) dailyMap[d] = { gmv: 0, orders: 0 }
    dailyMap[d].gmv += o.pay_amount; dailyMap[d].orders += 1
  })
  const entries = Object.entries(dailyMap).sort()
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 55, right: 20, top: 20, bottom: 20 },
    xAxis: { type: 'category' as const, data: entries.map((e) => e[0]) },
    yAxis: { type: 'value' as const },
    series: [{
      name: trendMetric.value === 'gmv' ? '销售额(元)' : '订单数',
      type: 'line' as const, smooth: true, areaStyle: { opacity: 0.15 },
      data: entries.map((e) => (trendMetric.value === 'orders' ? e[1].orders : e[1].gmv / 100)),
    }],
    graphic: entries.length === 0 ? [{ type: 'text' as const, left: 'center', top: 'center', style: { text: '暂无数据', fontSize: 14, fill: '#8c8c8c' } }] : undefined,
  }
})

// ── Helpers ──

function centToYuan(c: number) { return (c / 100).toFixed(2) }
function fmtNum(n: number): string { return n >= 10000 ? (n / 10000).toFixed(1) + '万' : n.toLocaleString() }
function fmtTime(ts: number) { return ts ? dayjs.unix(ts).format('MM-DD HH:mm') : '-' }
function statusLabel(s: number) { const m: Record<number, string> = { 10: '待付款', 12: '待收下', 20: '待发货', 21: '部分发货', 30: '待收货', 100: '已完成', 200: '全部退款', 250: '已取消' }; return m[s] || `状态${s}` }
function statusClass(s: number) { if (s === 100) return 'is-done'; if (s >= 30) return 'is-shipping'; if (s >= 20) return 'is-paid'; if (s >= 10) return 'is-pending'; return 'is-cancel' }
function hideImg(e: Event) { (e.target as HTMLImageElement).style.display = 'none' }

// ── API ──

async function loadStores() {
  const res = await wechatStoreApi.getStores()
  if (Array.isArray(res.data)) stores.value = res.data
  if (stores.value.length > 0 && !activeStoreId.value) activeStoreId.value = stores.value[0].id
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
    if (afterRes?.data?.errcode === 0) aftersaleCount.value = afterRes.data.after_sale_order_id_list?.length || 0
    if (infoRes?.data?.errcode === 0) shopInfo.value = infoRes.data.info || null
  } catch { /* silent */ }
  finally { loading.value = false }
}

onMounted(async () => {
  await loadStores()
  await loadStoreData()
  timer = setInterval(loadStoreData, 60000)
})

onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<style lang="scss" scoped>
.monetization {
  max-width: 1200px; margin: 0 auto; padding-bottom: 40px;
  &__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  &__title { font-size: 22px; font-weight: 700; color: #f0ece4; margin: 0; }
  &__actions { display: flex; gap: 8px; align-items: center; }
  &__kpi { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 24px; }
  &__chart { margin-bottom: 24px; }
  &__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  @media (max-width: 960px) { &__kpi { grid-template-columns: repeat(3, 1fr); } &__grid { grid-template-columns: 1fr; } }
}

.shop-info {
  display: flex; align-items: center; gap: 14px; margin-bottom: 24px;
  padding: 16px 20px; background: #1e1c1a; border: 1px solid #2e2a26; border-radius: 12px;
  &__avatar { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; }
  &__name { font-size: 16px; font-weight: 600; color: #f0ece4; }
  &__meta { font-size: 12px; color: #6b6b6b; margin-top: 2px; }
}

.kpi-card {
  background: linear-gradient(135deg, #252220 0%, #1e1c1a 100%); border: 1px solid #3a3530;
  border-radius: 12px; padding: 18px 16px; text-align: center;
  &--sm { padding: 12px; }
  &__label { font-size: 12px; color: #8c8c8c; margin-bottom: 6px; }
  &__value { font-size: 24px; font-weight: 700; color: #f0ece4; font-feature-settings: 'tnum'; &--sm { font-size: 18px; } }
  &__sub { font-size: 11px; color: #6b6b6b; margin-top: 4px; }
}

.card {
  background: #1e1c1a; border: 1px solid #2e2a26; border-radius: 12px; overflow: hidden;
  &__header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid #2e2a26; font-size: 14px; font-weight: 600; color: #e8e0d0; }
  &__count { font-size: 12px; color: #6b6b6b; font-weight: 400; }
}

.empty-hint { padding: 40px; text-align: center; color: #6b6b6b; font-size: 14px; }

.order-list { padding: 10px 20px; max-height: 450px; overflow-y: auto; }
.order-item {
  display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #252220;
  &:last-child { border-bottom: none; }
  &__img { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
  &__info { flex: 1; min-width: 0; }
  &__title { font-size: 13px; color: #d4cfc4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px; }
  &__meta { display: flex; gap: 8px; align-items: center; }
  &__time { font-size: 11px; color: #6b6b6b; }
  &__status { font-size: 10px; padding: 1px 6px; border-radius: 3px;
    &.is-done { color: #6b9e6c; background: rgba(107,158,108,.15); }
    &.is-shipping { color: #5b8ed4; background: rgba(91,142,212,.15); }
    &.is-paid { color: #e0a030; background: rgba(224,160,48,.15); }
    &.is-pending { color: #8c8c8c; background: rgba(140,140,140,.15); }
    &.is-cancel { color: #d4534a; background: rgba(212,83,74,.15); }
  }
  &__price { font-size: 14px; font-weight: 600; color: #f0ece4; font-feature-settings: 'tnum'; flex-shrink: 0; }
}

.product-grid { padding: 10px 20px; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; max-height: 450px; overflow-y: auto; }
.product-card {
  display: flex; gap: 10px; padding: 10px; background: #252220; border-radius: 8px; border: 1px solid #2e2a26;
  &__img { width: 44px; height: 44px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
  &__info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  &__title { font-size: 12px; color: #d4cfc4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  &__stats { display: flex; gap: 8px; align-items: baseline; margin-top: 4px; flex-wrap: wrap; font-size: 11px; color: #6b6b6b; }
  &__price { font-size: 13px; font-weight: 600; color: #f0ece4; font-feature-settings: 'tnum'; }
}
</style>
