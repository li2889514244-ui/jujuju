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
          <el-button type="primary" :loading="loading" @click="refreshAll">查询</el-button>
        </el-form-item>
        <el-form-item>
          <el-button type="success" @click="openManualDialog">手动录入</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 手动录入弹窗 -->
    <el-dialog v-model="manualDialogVisible" title="手动录入变现数据" width="500px">
      <el-form :model="manualForm" label-width="80px">
        <el-form-item label="日期" required>
          <el-date-picker
            v-model="manualForm.date"
            type="date"
            placeholder="选择日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="平台" required>
          <el-select v-model="manualForm.platform" placeholder="选择平台" style="width: 100%">
            <el-option
              v-for="(label, key) in PLATFORM_LABELS"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="收入(¥)">
          <el-input v-model.number="manualForm.revenue" type="number" placeholder="0" />
        </el-form-item>
        <el-form-item label="GMV(¥)">
          <el-input v-model.number="manualForm.gmv" type="number" placeholder="0" />
        </el-form-item>
        <el-form-item label="订单数">
          <el-input v-model.number="manualForm.orders" type="number" placeholder="0" />
        </el-form-item>
        <el-form-item label="买家数">
          <el-input v-model.number="manualForm.buyerCount" type="number" placeholder="0" />
        </el-form-item>
        <el-form-item label="佣金(¥)">
          <el-input v-model.number="manualForm.commission" type="number" placeholder="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="manualDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="manualSubmitting" @click="submitManual">提交</el-button>
      </template>
    </el-dialog>

    <!-- KPI Cards -->
    <el-row :gutter="20" class="monetization__overview">
      <el-col v-for="card in kpiCards" :key="card.label" :xs="12" :sm="8" :md="4">
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

    <!-- 微信小店实时数据 -->
    <el-row :gutter="20" class="monetization__body">
      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <div class="chart-header">
              <span>微信小店 · 最近佣金单</span>
              <el-tag size="small" type="warning">达人端</el-tag>
            </div>
          </template>
          <el-table v-loading="wxLoading" :data="wechatOrders" stripe size="small">
            <template #empty>
              <el-empty description="暂无佣金数据，请确认带货助手已绑定" />
            </template>
            <el-table-column label="商品" min-width="140">
              <template #default="{ row }">
                <div style="display: flex; align-items: center; gap: 8px">
                  <el-avatar
                    v-if="row.product_img"
                    :src="row.product_img"
                    size="small"
                    shape="square"
                  />
                  <span
                    style="
                      white-space: nowrap;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      max-width: 120px;
                    "
                    >{{ row.product_title }}</span
                  >
                </div>
              </template>
            </el-table-column>
            <el-table-column label="金额" width="90">
              <template #default="{ row }">¥{{ (row.pay_amount / 100).toFixed(2) }}</template>
            </el-table-column>
            <el-table-column label="佣金" width="100">
              <template #default="{ row }">
                <span style="color: #f59e0b">¥{{ (row.commission / 100).toFixed(2) }}</span>
                <br />
                <span style="font-size: 11px; color: #999"
                  >{{ (row.commission_rate / 100).toFixed(1) }}%</span
                >
              </template>
            </el-table-column>
            <el-table-column label="时间" width="100">
              <template #default="{ row }">{{ formatTime(row.create_time) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card shadow="hover">
          <template #header>
            <div class="chart-header">
              <span>微信小店 · 橱窗商品</span>
              <el-button size="small" type="primary" link @click="refreshWechatStore"
                >刷新</el-button
              >
            </div>
          </template>
          <el-table v-loading="wxLoading" :data="wechatProducts" stripe size="small">
            <template #empty>
              <el-empty description="暂无橱窗商品" />
            </template>
            <el-table-column label="商品" min-width="140">
              <template #default="{ row }">
                <div style="display: flex; align-items: center; gap: 8px">
                  <el-avatar v-if="row.img_url" :src="row.img_url" size="small" shape="square" />
                  <span
                    style="
                      white-space: nowrap;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      max-width: 120px;
                    "
                    >{{ row.title }}</span
                  >
                </div>
              </template>
            </el-table-column>
            <el-table-column label="售价" width="80">
              <template #default="{ row }">¥{{ (row.selling_price / 100).toFixed(0) }}</template>
            </el-table-column>
            <el-table-column label="已售" width="70">
              <template #default="{ row }">{{ row.sales }}</template>
            </el-table-column>
            <el-table-column label="库存" width="70">
              <template #default="{ row }">{{ row.stock }}</template>
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
import { wechatStoreApi, type WechatOrder, type WechatProduct } from '@/api/wechat-store'
import { PLATFORM_LABELS, type Platform } from '@/types'
import dayjs from 'dayjs'

const days = ref(30)
const loading = ref(false)
const trendMetric = ref('revenue')
const data = ref<any>(null)

// Manual entry dialog
const manualDialogVisible = ref(false)
const manualSubmitting = ref(false)
const manualForm = ref({
  date: '',
  platform: '',
  revenue: null as number | null,
  gmv: null as number | null,
  orders: null as number | null,
  buyerCount: null as number | null,
  commission: null as number | null,
})

function openManualDialog() {
  manualForm.value = {
    date: '',
    platform: '',
    revenue: null,
    gmv: null,
    orders: null,
    buyerCount: null,
    commission: null,
  }
  manualDialogVisible.value = true
}

async function submitManual() {
  if (!manualForm.value.date || !manualForm.value.platform) {
    ElMessage.warning('请填写日期和平台')
    return
  }
  manualSubmitting.value = true
  try {
    await analyticsApi.createManualMonetization({
      date: dayjs(manualForm.value.date).format('YYYY-MM-DD'),
      platform: manualForm.value.platform,
      ...(manualForm.value.revenue !== null && { revenue: manualForm.value.revenue }),
      ...(manualForm.value.gmv !== null && { gmv: manualForm.value.gmv }),
      ...(manualForm.value.orders !== null && { orders: manualForm.value.orders }),
      ...(manualForm.value.buyerCount !== null && { buyerCount: manualForm.value.buyerCount }),
      ...(manualForm.value.commission !== null && { commission: manualForm.value.commission }),
    })
    ElMessage.success('录入成功')
    manualDialogVisible.value = false
    refreshAll()
  } catch (e: any) {
    ElMessage.error(e?.message || '录入失败')
  } finally {
    manualSubmitting.value = false
  }
}

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
    { label: '商品数量', value: formatNum(d.totalProductCount || 0) },
  ]
})

const byPlatform = computed(() => {
  return (data.value?.byPlatform || []).map((p: any) => ({
    ...p,
    platformLabel: PLATFORM_LABELS[p.platform as Platform] || p.platform,
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

// ── 微信小店数据 ──
const wxLoading = ref(false)
const wechatOrders = ref<WechatOrder[]>([])
const wechatProducts = ref<WechatProduct[]>([])

function formatTime(ts: number) {
  if (!ts) return '-'
  return dayjs.unix(ts).format('MM-DD HH:mm')
}

async function loadWechatStore() {
  wxLoading.value = true
  try {
    const [ordRes, prodRes] = await Promise.all([
      wechatStoreApi.getOrders({ page_size: 10 }),
      wechatStoreApi.getProducts({ page_size: 20 }),
    ])
    if (ordRes.data?.errcode === 0) {
      wechatOrders.value = ordRes.data.order_list || []
    }
    if (prodRes.data?.errcode === 0) {
      wechatProducts.value = prodRes.data.products || []
    }
  } catch {
    // 微信小店 API 调用失败，静默处理
  } finally {
    wxLoading.value = false
  }
}

async function refreshWechatStore() {
  await loadWechatStore()
  ElMessage.success('微信小店数据已刷新')
}

onMounted(() => {
  loadData()
  loadWechatStore()
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
