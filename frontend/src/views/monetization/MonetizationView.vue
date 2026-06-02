<template>
  <div class="monetization">
    <!-- Header -->
    <div class="monetization__header">
      <h2 class="monetization__title">变现中心</h2>
      <div class="monetization__actions">
        <el-radio-group v-model="days" size="small" @change="loadAll">
          <el-radio-button :value="7">近7天</el-radio-button>
          <el-radio-button :value="30">近30天</el-radio-button>
          <el-radio-button :value="90">近90天</el-radio-button>
        </el-radio-group>
        <el-button :icon="Refresh" circle size="small" :loading="loading" @click="loadAll" />
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="monetization__kpi">
      <div v-for="card in kpiCards" :key="card.label" class="kpi-card">
        <div class="kpi-card__label">{{ card.label }}</div>
        <div class="kpi-card__value">{{ card.value }}</div>
        <div v-if="card.sub" class="kpi-card__sub">{{ card.sub }}</div>
      </div>
    </div>

    <!-- Trend Chart -->
    <div class="monetization__chart card">
      <div class="card__header">
        <span>佣金趋势</span>
        <el-radio-group v-model="trendMetric" size="small">
          <el-radio-button value="commission">佣金</el-radio-button>
          <el-radio-button value="gmv">GMV</el-radio-button>
          <el-radio-button value="orders">订单数</el-radio-button>
        </el-radio-group>
      </div>
      <DataChart :option="trendOption" :height="300" />
    </div>

    <!-- Orders + Products -->
    <div class="monetization__grid">
      <!-- Commission Orders -->
      <div class="card">
        <div class="card__header">
          <span>最近佣金单</span>
          <el-tag size="small" type="warning">微信小店达人端</el-tag>
        </div>
        <div class="order-list" v-loading="loading">
          <div v-if="filteredOrders.length === 0" class="empty-hint">暂无佣金数据</div>
          <div
            v-for="order in filteredOrders"
            :key="order.order_id"
            class="order-item"
          >
            <img
              v-if="order.product_img"
              :src="order.product_img"
              class="order-item__img"
              @error="($event.target as HTMLImageElement).style.display='none'"
            />
            <div class="order-item__info">
              <div class="order-item__title">{{ order.product_title || '未知商品' }}</div>
              <div class="order-item__meta">
                <span class="order-item__time">{{ fmtTime(order.create_time) }}</span>
                <span
                  class="order-item__status"
                  :class="statusClass(order.status)"
                >{{ statusLabel(order.status) }}</span>
              </div>
            </div>
            <div class="order-item__money">
              <div class="order-item__price">&yen;{{ centToYuan(order.pay_amount) }}</div>
              <div class="order-item__commission">
                +&yen;{{ centToYuan(order.commission) }}
                <span class="order-item__rate">{{ rateToPct(order.commission_rate) }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Product Showcase -->
      <div class="card">
        <div class="card__header">
          <span>橱窗商品</span>
          <span class="card__count">{{ sortedProducts.length }} 件</span>
        </div>
        <div class="product-grid" v-loading="loading">
          <div v-if="sortedProducts.length === 0" class="empty-hint">暂无橱窗商品</div>
          <div
            v-for="prod in sortedProducts"
            :key="prod.product_id"
            class="product-card"
          >
            <img
              v-if="prod.img_url"
              :src="prod.img_url"
              class="product-card__img"
              @error="($event.target as HTMLImageElement).style.display='none'"
            />
            <div class="product-card__info">
              <div class="product-card__title">{{ prod.title }}</div>
              <div class="product-card__stats">
                <span class="product-card__price">&yen;{{ centToYuan(prod.selling_price) }}</span>
                <span class="product-card__sales">已售 {{ fmtNum(prod.sales) }}</span>
              </div>
              <div class="product-card__rate">佣金 {{ rateToPct(prod.commission_rate) }}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Manual Entry (collapsed) -->
    <div class="card">
      <div class="card__header clickable" @click="showManual = !showManual">
        <span>手动录入</span>
        <span class="card__toggle">{{ showManual ? '收起' : '展开' }}</span>
      </div>
      <div v-if="showManual" class="manual-form">
        <el-form :inline="true" size="small">
          <el-form-item label="日期">
            <el-date-picker v-model="manual.date" type="date" placeholder="选择日期" />
          </el-form-item>
          <el-form-item label="平台">
            <el-select v-model="manual.platform" placeholder="选择平台" style="width:120px">
              <el-option v-for="(l,k) in PLATFORM_LABELS" :key="k" :label="l" :value="k" />
            </el-select>
          </el-form-item>
          <el-form-item label="收入">
            <el-input v-model.number="manual.revenue" placeholder="0" style="width:100px" />
          </el-form-item>
          <el-form-item label="GMV">
            <el-input v-model.number="manual.gmv" placeholder="0" style="width:100px" />
          </el-form-item>
          <el-form-item label="订单">
            <el-input v-model.number="manual.orders" placeholder="0" style="width:80px" />
          </el-form-item>
          <el-form-item label="佣金">
            <el-input v-model.number="manual.commission" placeholder="0" style="width:100px" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="manualSubmitting" @click="submitManual">提交</el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import DataChart from '@/components/common/DataChart.vue'
import { wechatStoreApi, type WechatOrder, type WechatProduct, type WechatStore } from '@/api/wechat-store'
import { analyticsApi } from '@/api/analytics'
import { PLATFORM_LABELS } from '@/types'
import dayjs from 'dayjs'

const days = ref(30)
const loading = ref(false)
const trendMetric = ref('commission')
const showManual = ref(false)

// Data
const orders = ref<WechatOrder[]>([])
const products = ref<WechatProduct[]>([])

// Manual entry
const manual = ref({ date: '', platform: '', revenue: null as number | null, gmv: null as number | null, orders: null as number | null, commission: null as number | null })
const manualSubmitting = ref(false)

// ── Computed ──

const filteredOrders = computed(() => {
  const cutoff = Date.now() - days.value * 86400000
  return orders.value.filter(o => o.create_time * 1000 >= cutoff)
})

const kpiCards = computed(() => {
  const list = filteredOrders.value
  const totalGmv = list.reduce((s, o) => s + o.pay_amount, 0)
  const totalCommission = list.reduce((s, o) => s + o.commission, 0)
  const count = list.length
  const avgOrder = count > 0 ? totalGmv / count : 0
  return [
    { label: '总佣金', value: `\u00a5${centToYuan(totalCommission)}`, sub: `${count} 单` },
    { label: '总 GMV', value: `\u00a5${centToYuan(totalGmv)}` },
    { label: '客单价', value: `\u00a5${centToYuan(avgOrder)}` },
    { label: '在售商品', value: `${products.value.filter(p => p.status === 0).length}` },
    { label: '累计已售', value: fmtNum(products.value.reduce((s, p) => s + p.sales, 0)) },
  ]
})

const sortedProducts = computed(() =>
  [...products.value].sort((a, b) => b.sales - a.sales)
)

const trendOption = computed(() => {
  const list = filteredOrders.value
  const dailyMap: Record<string, { commission: number; gmv: number; orders: number }> = {}
  list.forEach(o => {
    const d = dayjs.unix(o.create_time).format('MM-DD')
    if (!dailyMap[d]) dailyMap[d] = { commission: 0, gmv: 0, orders: 0 }
    dailyMap[d].commission += o.commission
    dailyMap[d].gmv += o.pay_amount
    dailyMap[d].orders += 1
  })
  const entries = Object.entries(dailyMap).sort()
  const labels: Record<string, string> = { commission: '佣金(元)', gmv: 'GMV(元)', orders: '订单数' }
  return {
    tooltip: { trigger: 'axis' as const },
    grid: { left: 50, right: 20, top: 30, bottom: 30 },
    xAxis: { type: 'category' as const, data: entries.map(e => e[0]) },
    yAxis: { type: 'value' as const },
    series: [{
      name: labels[trendMetric.value],
      type: 'line' as const,
      smooth: true,
      areaStyle: { opacity: 0.15 },
      data: entries.map(e => (trendMetric.value === 'orders' ? e[1].orders : e[1][trendMetric.value as 'commission' | 'gmv'] / 100)),
    }],
    graphic: entries.length === 0 ? [{ type: 'text' as const, left: 'center', top: 'center', style: { text: '暂无数据', fontSize: 14, fill: '#8c8c8c' } }] : undefined,
  }
})

// ── Helpers ──

function centToYuan(c: number) { return (c / 100).toFixed(2) }
function rateToPct(r: number) { return (r / 100).toFixed(1) }
function fmtNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}
function fmtTime(ts: number) { return ts ? dayjs.unix(ts).format('MM-DD HH:mm') : '-' }
function statusLabel(s: number) {
  const m: Record<number, string> = { 0: '待付款', 1: '已付款', 2: '已结算', 3: '已退款' }
  return m[s] || `状态${s}`
}
function statusClass(s: number) {
  return { 'is-settled': s === 2, 'is-paid': s === 1, 'is-refund': s === 3 }
}

// ── API ──

async function loadAll() {
  loading.value = true
  try {
    const [ordRes, prodRes] = await Promise.all([
      wechatStoreApi.getOrders({ page_size: 100 }),
      wechatStoreApi.getProducts({ page_size: 50 }),
    ])
    if (ordRes.data?.errcode === 0) orders.value = ordRes.data.order_list || []
    if (prodRes.data?.errcode === 0) products.value = prodRes.data.products || []
  } catch { /* silent */ }
  finally { loading.value = false }
}

async function submitManual() {
  if (!manual.value.date || !manual.value.platform) { ElMessage.warning('请填写日期和平台'); return }
  manualSubmitting.value = true
  try {
    await analyticsApi.createManualMonetization({
      date: dayjs(manual.value.date).format('YYYY-MM-DD'),
      platform: manual.value.platform,
      ...(manual.value.revenue != null && { revenue: manual.value.revenue }),
      ...(manual.value.gmv != null && { gmv: manual.value.gmv }),
      ...(manual.value.orders != null && { orders: manual.value.orders }),
      ...(manual.value.commission != null && { commission: manual.value.commission }),
    })
    ElMessage.success('录入成功')
    manual.value = { date: '', platform: '', revenue: null, gmv: null, orders: null, commission: null }
  } catch (e: any) { ElMessage.error(e?.message || '录入失败') }
  finally { manualSubmitting.value = false }
}

onMounted(loadAll)
</script>

<style lang="scss" scoped>
.monetization {
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 40px;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }
  &__title { font-size: 22px; font-weight: 700; color: #f0ece4; margin: 0; }
  &__actions { display: flex; gap: 8px; align-items: center; }

  &__kpi { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 24px; }
  &__chart { margin-bottom: 24px; }
  &__grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }

  @media (max-width: 960px) {
    &__kpi { grid-template-columns: repeat(3, 1fr); }
    &__grid { grid-template-columns: 1fr; }
  }
}

// KPI Card
.kpi-card {
  background: linear-gradient(135deg, #252220 0%, #1e1c1a 100%);
  border: 1px solid #3a3530;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  &__label { font-size: 13px; color: #8c8c8c; margin-bottom: 8px; }
  &__value { font-size: 26px; font-weight: 700; color: #f0ece4; font-feature-settings: 'tnum'; }
  &__sub { font-size: 12px; color: #6b6b6b; margin-top: 4px; }
}

// Card
.card {
  background: #1e1c1a;
  border: 1px solid #2e2a26;
  border-radius: 12px;
  overflow: hidden;
  &__header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 16px 20px; border-bottom: 1px solid #2e2a26;
    font-size: 15px; font-weight: 600; color: #e8e0d0;
    &.clickable { cursor: pointer; user-select: none; &:hover { background: #252220; } }
  }
  &__count { font-size: 12px; color: #6b6b6b; font-weight: 400; }
  &__toggle { font-size: 12px; color: #8c8c8c; }
}

.empty-hint { padding: 40px; text-align: center; color: #6b6b6b; font-size: 14px; }

// Order List
.order-list { padding: 12px 20px; max-height: 480px; overflow-y: auto; }
.order-item {
  display: flex; align-items: center; gap: 12px; padding: 12px 0;
  border-bottom: 1px solid #252220;
  &:last-child { border-bottom: none; }
  &__img { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
  &__info { flex: 1; min-width: 0; }
  &__title { font-size: 13px; color: #d4cfc4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; }
  &__meta { display: flex; gap: 8px; align-items: center; }
  &__time { font-size: 11px; color: #6b6b6b; }
  &__status { font-size: 11px; padding: 0 6px; border-radius: 4px; }
  &__status.is-settled { color: #6b9e6c; background: rgba(107,158,108,.15); }
  &__status.is-paid { color: #e0a030; background: rgba(224,160,48,.15); }
  &__status.is-refund { color: #d4534a; background: rgba(212,83,74,.15); }
  &__money { text-align: right; flex-shrink: 0; }
  &__price { font-size: 14px; font-weight: 600; color: #f0ece4; font-feature-settings: 'tnum'; }
  &__commission { font-size: 12px; color: #d49b50; font-feature-settings: 'tnum'; }
  &__rate { color: #6b6b6b; font-size: 11px; }
}

// Product Grid
.monetization__grid .product-grid {
  padding: 12px 20px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  max-height: 480px;
  overflow-y: auto;
}
.product-card {
  display: flex; gap: 10px; padding: 12px;
  background: #252220; border-radius: 8px; border: 1px solid #2e2a26;
  &__img { width: 48px; height: 48px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
  &__info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
  &__title { font-size: 12px; color: #d4cfc4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  &__stats { display: flex; gap: 8px; align-items: baseline; margin-top: 4px; }
  &__price { font-size: 14px; font-weight: 600; color: #f0ece4; font-feature-settings: 'tnum'; }
  &__sales { font-size: 11px; color: #6b6b6b; }
  &__rate { font-size: 11px; color: #d49b50; margin-top: 2px; }
}

// Manual
.manual-form { padding: 16px 20px; }
</style>
