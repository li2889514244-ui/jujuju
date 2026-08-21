<template>
  <div class="performance-page">
    <section class="hero-card">
      <div class="hero-card__header">
        <div>
          <div class="hero-card__eyebrow">{{ currentMonthLabel }} · 全店铺有效订单</div>
          <h2 class="hero-card__title">业绩天梯</h2>
          <p class="hero-card__subtitle">
            按老师归因看当月冲刺进度，默认隐藏未匹配来源，避免鱼龙混杂的数据干扰判断。
          </p>
        </div>
        <div class="hero-card__actions">
          <el-button text size="small" @click="showRules = true">调整归因规则</el-button>
          <el-button :icon="Refresh" circle size="small" :loading="loading" @click="loadData" />
        </div>
      </div>

      <div class="hero-card__body">
        <div class="hero-card__progress-panel">
          <div class="hero-card__score">
            <strong>{{ totalCurrentOrders }}</strong>
            <span>/ {{ totalTargetOrders }} 单</span>
          </div>
          <el-progress
            :percentage="totalProgress"
            :stroke-width="16"
            :show-text="false"
            class="hero-card__progress"
          />
          <div class="hero-card__progress-meta">
            <span>已完成 {{ totalProgress }}%</span>
            <span>还差 {{ totalRemainingOrders }} 单</span>
          </div>
        </div>

        <div class="hero-card__metrics">
          <div class="metric-tile">
            <span>剩余日均</span>
            <strong>{{ dailyRequiredOrders }}</strong>
            <em>单/天</em>
          </div>
          <div class="metric-tile">
            <span>去退款</span>
            <strong>{{ totalRefundedOrders }}</strong>
            <em>单已排除</em>
          </div>
          <div class="metric-tile">
            <span>覆盖店铺</span>
            <strong>{{ storeSummaries.length }}</strong>
            <em>家</em>
          </div>
        </div>
      </div>

      <div class="filter-bar">
        <el-select v-model="selectedTeacher" size="small" class="filter-bar__select">
          <el-option label="全部老师" value="all" />
          <el-option
            v-for="teacher in teachers"
            :key="teacher.id"
            :label="teacher.name"
            :value="teacher.name"
          />
        </el-select>
        <el-select v-model="selectedPlatform" size="small" class="filter-bar__select">
          <el-option label="全部平台" value="all" />
          <el-option label="微信小店" value="微信小店" />
          <el-option label="抖店" value="抖店" />
        </el-select>
        <el-button
          :type="excludeRefunded ? 'primary' : 'default'"
          size="small"
          @click="toggleRefunds"
        >
          {{ excludeRefunded ? '已去退款' : '去退款' }}
        </el-button>
        <el-button
          :type="showUnmatched ? 'warning' : 'default'"
          size="small"
          @click="showUnmatched = !showUnmatched"
        >
          {{ showUnmatched ? '显示未匹配' : '隐藏未匹配' }}
        </el-button>
        <span v-for="chip in activeChips" :key="chip" class="filter-bar__chip">{{ chip }}</span>
      </div>
    </section>

    <section class="teacher-board">
      <div class="section-title">
        <div>
          <h3>老师目标卡</h3>
          <p>看谁在冲刺、谁需要补量，目标和归因规则可在右上角统一调整。</p>
        </div>
        <el-button size="small" type="primary" plain @click="addTeacher">添加老师</el-button>
      </div>
      <div v-loading="loading" class="teacher-grid">
        <div
          v-for="teacher in teacherRows"
          :key="teacher.id"
          class="teacher-card"
          :class="{ 'teacher-card--muted': teacher.locked }"
        >
          <div class="teacher-card__top">
            <div>
              <div class="teacher-card__name">{{ teacher.name }}</div>
              <div class="teacher-card__status">{{ teacherStatusText(teacher) }}</div>
            </div>
            <el-tag size="small" :type="teacherTagType(teacher)" effect="dark">
              {{ teacher.progress }}%
            </el-tag>
          </div>
          <div class="teacher-card__numbers">
            <strong>{{ teacher.orders }}</strong>
            <span>/ {{ teacher.target }} 单</span>
          </div>
          <el-progress :percentage="teacher.progress" :stroke-width="10" :show-text="false" />
          <div class="teacher-card__foot">
            <span>还差 {{ teacher.remaining }} 单</span>
            <span v-if="teacher.refunded > 0">去退款 {{ teacher.refunded }} 单</span>
          </div>
        </div>
        <div v-if="teacherRows.length === 0" class="empty-hint">
          暂无老师目标，点击添加老师开始配置
        </div>
      </div>
    </section>

    <div class="section-card">
      <div class="section-card__header">
        <span>出单来源排行</span>
        <div class="section-card__tools">
          <el-input
            v-model="sourceSearch"
            size="small"
            class="section-card__search"
            placeholder="搜索来源/店铺/老师"
            clearable
          />
          <span class="section-card__meta">
            {{ sourceRanking.length ? `${sourceRanking.length} 个来源` : '暂无来源' }}
          </span>
        </div>
      </div>
      <div v-loading="loading" class="source-board">
        <div v-if="topSources.length > 0" class="podium">
          <div
            v-for="(source, index) in topSources"
            :key="source.key"
            class="podium-card"
            :class="`podium-card--${index + 1}`"
            role="button"
            tabindex="0"
            @click="openSourceDetail(source)"
            @keydown.enter.prevent="openSourceDetail(source)"
            @keydown.space.prevent="openSourceDetail(source)"
          >
            <div class="podium-card__badge">{{ rankIcon(index) }}</div>
            <div>
              <el-tag size="small" :type="rankTagType(index)" effect="dark">
                {{ rankLabel(index) }}
              </el-tag>
              <h3>{{ source.name }}</h3>
              <p>{{ source.teacherName }} · {{ source.platformLabel }} · {{ source.storeLabel }}</p>
              <p class="podium-card__operator">
                {{ source.operator ? `运营者：${source.operator}` : '未设置运营者' }}
              </p>
            </div>
            <div class="podium-card__orders">
              <strong>{{ source.orders }}</strong>
              <span>单</span>
              <em v-if="source.refunded > 0">去退款 {{ source.refunded }} 单</em>
            </div>
          </div>
        </div>

        <div class="source-list">
          <div
            v-for="(source, index) in listSources"
            :key="source.key"
            class="source-row"
            role="button"
            tabindex="0"
            @click="openSourceDetail(source)"
            @keydown.enter.prevent="openSourceDetail(source)"
            @keydown.space.prevent="openSourceDetail(source)"
          >
            <div class="source-row__rank">{{ index + 4 }}</div>
            <div class="source-row__main">
              <div class="source-row__title">
                <div class="source-row__name">{{ source.name }}</div>
              </div>
              <div class="source-row__meta">
                <span>{{ source.teacherName }}</span>
                <span>{{ source.platformLabel }}</span>
                <span>{{ source.storeLabel }}</span>
                <span>{{ source.operator ? `运营者：${source.operator}` : '未设置运营者' }}</span>
              </div>
            </div>
            <div class="source-row__stats">
              <strong>{{ source.orders }}</strong>
              <span>单</span>
              <small v-if="source.refunded > 0">去退款 {{ source.refunded }} 单</small>
            </div>
          </div>
        </div>
        <div v-if="sourceRanking.length === 0" class="empty-hint">
          {{ loading ? '正在读取出单来源…' : '暂无当月出单来源' }}
        </div>
      </div>
    </div>

    <div class="section-card section-card--compact">
      <div class="section-card__header">
        <span>店铺明细</span>
        <span class="section-card__meta">{{ storeSummaries.length }} 家店铺</span>
      </div>
      <div v-loading="loading" class="store-grid">
        <div v-for="store in storeSummaries" :key="store.key" class="store-card">
          <div class="store-card__top">
            <strong>{{ store.name }}</strong>
            <span>{{ store.platform }}</span>
          </div>
          <div class="store-card__stats">
            <span>{{ store.orders }} 单</span>
            <em v-if="store.refunded > 0">去退款 {{ store.refunded }} 单</em>
          </div>
        </div>
        <div v-if="storeSummaries.length === 0" class="empty-hint">
          {{ loading ? '正在读取店铺订单…' : '暂无当月店铺订单' }}
        </div>
      </div>
    </div>

    <el-drawer v-model="showRules" title="归因规则与目标" size="520px">
      <div class="rules-panel">
        <p class="rules-panel__hint">
          只有命中老师名称或关键词的来源才会进入默认榜单。关键词建议放账号名、品牌名、课程名。
        </p>
        <div v-for="teacher in teachers" :key="teacher.id" class="rule-card">
          <div class="rule-card__header">
            <el-input
              v-model="teacher.name"
              size="small"
              placeholder="老师姓名"
              @change="saveTeachers"
            />
            <el-button size="small" text type="danger" @click="removeTeacher(teacher.id)">
              删除
            </el-button>
          </div>
          <div class="rule-card__target">
            <span>月目标</span>
            <el-input-number
              v-model="teacher.target"
              :min="0"
              :step="50"
              :controls="false"
              size="small"
              @change="saveTeachers"
            />
            <span>单</span>
          </div>
          <el-input
            v-model="teacher.keywordsText"
            type="textarea"
            :rows="3"
            placeholder="识别关键词，用逗号分隔"
            @change="saveTeachers"
          />
        </div>
        <el-button type="primary" plain class="rules-panel__add" @click="addTeacher">
          添加老师
        </el-button>
      </div>
    </el-drawer>

    <el-drawer v-model="showSourceDetail" title="出单账号详情" size="560px">
      <div v-if="selectedSource" class="source-detail">
        <div class="source-detail__head">
          <div>
            <span>出单账号</span>
            <h3>{{ selectedSource.name }}</h3>
            <p>{{ selectedSource.teacherName }} · {{ selectedSource.platformLabel }} · {{ selectedSource.storeLabel }}</p>
          </div>
          <strong>{{ selectedSource.orders }} 单</strong>
        </div>

        <div class="source-detail__operator">
          <span>运营者</span>
          <div>
            <el-input
              v-model="sourceOperatorDraft"
              placeholder="填写这个出单账号对应的运营者"
              clearable
              @keyup.enter="saveSourceOperator"
            />
            <el-button type="primary" @click="saveSourceOperator">保存</el-button>
          </div>
        </div>

        <div class="source-detail__stats">
          <div>
            <span>覆盖平台</span>
            <strong>{{ selectedSource.platforms.length }}</strong>
          </div>
          <div>
            <span>覆盖店铺</span>
            <strong>{{ selectedSource.storeNames.length }}</strong>
          </div>
          <div>
            <span>去退款</span>
            <strong>{{ selectedSource.refunded }}</strong>
          </div>
        </div>

        <div class="source-detail__orders">
          <div class="source-detail__section-title">订单归属</div>
          <div v-for="order in selectedSourceOrders" :key="order.id" class="source-detail__order">
            <img
              v-if="order.productImg"
              :src="order.productImg"
              class="source-detail__order-img"
              @error="hideImg"
            />
            <div class="source-detail__order-info">
              <strong>{{ order.productTitle || '未知商品' }}</strong>
              <div class="source-detail__order-meta">
                <span>{{ fmtTime(order.createTime) }}</span>
                <span
                  class="source-detail__order-status"
                  :class="order.isRefunded ? 'is-cancel' : order.statusClass"
                >
                  {{ order.isRefunded ? '已退款' : order.statusLabel }}
                </span>
                <span v-if="order.shipped" class="source-detail__order-shipped">已发货</span>
                <span>订单号：{{ order.orderNo }}</span>
              </div>
              <div class="source-detail__order-source">成交来源：{{ order.sourceLabel }}</div>
            </div>
            <div class="source-detail__order-price">¥{{ centToYuan(order.amount) }}</div>
          </div>
          <div v-if="selectedSourceOrders.length === 0" class="empty-hint">
            当前筛选口径下暂无订单明细
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { doudianStoreApi, type DoudianStore } from '@/api/doudian-store'
import {
  wechatStoreApi,
  type WechatAftersale,
  type WechatOrder,
  type WechatOrderSourceInfo,
  type WechatStore,
} from '@/api/wechat-store'
import {
  doudianOrderStatus,
  getDoudianRevenueOrders,
  getDoudianSuccessfulRefundOrderIds,
  isDoudianSuccessfulRefund,
  type DoudianAftersaleMetric,
  type DoudianOrderMetric,
} from '@/utils/doudianStoreMetrics'
import { normalizeAftersales } from '@/utils/wechatStoreMetrics'

interface TeacherConfig {
  id: string
  name: string
  target: number
  keywordsText?: string
}

interface TeacherRow extends TeacherConfig {
  orders: number
  refunded: number
  remaining: number
  progress: number
  locked?: boolean
}

interface StoreSummary {
  key: string
  platform: string
  name: string
  orders: number
  refunded: number
}

interface SourceSummary {
  key: string
  accountKey: string
  name: string
  teacherName: string
  platform: string
  platformLabel: string
  platforms: string[]
  storeName: string
  storeLabel: string
  storeNames: string[]
  operator: string
  orderIds: string[]
  orders: number
  refunded: number
}

interface SourceSummaryAccumulator extends SourceSummary {
  teacherNames: Set<string>
  platformNames: Set<string>
  sourceStoreNames: Set<string>
}

interface LadderOrder {
  id: string
  orderNo: string
  platform: string
  storeId: string
  storeName: string
  sourceName: string
  sourceKey: string
  sourceLabel: string
  teacherText: string
  productTitle: string
  productImg?: string
  createTime: number
  amount: number
  statusLabel: string
  statusClass: string
  shipped: boolean
  isTransaction: boolean
  isRefunded: boolean
}

const DEFAULT_TEACHERS: TeacherConfig[] = [
  {
    id: 'teacher-luhui',
    name: '卢慧',
    target: 1600,
    keywordsText: '卢慧,卢慧老师,心理学博士卢慧,高维破局,幸福觉醒',
  },
  {
    id: 'teacher-wangjing',
    name: '王晶',
    target: 1600,
    keywordsText: '王晶,晶哥,晶哥来了,电影文化',
  },
]

const loading = ref(false)
const excludeRefunded = ref(false)
const showUnmatched = ref(false)
const showRules = ref(false)
const showSourceDetail = ref(false)
const selectedTeacher = ref('all')
const selectedPlatform = ref('all')
const selectedSourceKey = ref('')
const sourceSearch = ref('')
const sourceOperatorDraft = ref('')
const sourceOperators = ref<Record<string, string>>({})
const teachers = ref<TeacherConfig[]>([])
const orders = ref<LadderOrder[]>([])

const currentMonthLabel = computed(() => dayjs().format('YYYY年MM月'))
function getCurrentMonthRange() {
  const now = dayjs()
  return { start: now.startOf('month').unix(), end: now.endOf('day').unix() }
}
const teacherStorageKey = computed(() => `performance-ladder-teachers:${dayjs().format('YYYY-MM')}`)
const sourceOperatorStorageKey = 'performance-ladder-source-operators'
const visibleOrders = computed(() =>
  orders.value.filter(
    (order) => order.isTransaction && (!excludeRefunded.value || !order.isRefunded),
  ),
)
const totalCurrentOrders = computed(() => visibleOrders.value.length)
const totalRefundedOrders = computed(
  () => orders.value.filter((order) => order.isRefunded).length,
)
const totalTargetOrders = computed(() =>
  teachers.value.reduce((sum, teacher) => sum + Number(teacher.target || 0), 0),
)
const totalRemainingOrders = computed(() =>
  Math.max(0, totalTargetOrders.value - totalCurrentOrders.value),
)
const totalProgress = computed(() => {
  if (totalTargetOrders.value <= 0) return 0
  return Math.min(100, Math.round((totalCurrentOrders.value / totalTargetOrders.value) * 100))
})
const daysRemaining = computed(() => Math.max(1, dayjs().endOf('month').diff(dayjs(), 'day') + 1))
const dailyRequiredOrders = computed(() =>
  Math.ceil(totalRemainingOrders.value / daysRemaining.value),
)
const activeChips = computed(() => {
  const chips = [
    excludeRefunded.value ? '口径：已去退款' : '口径：含退款',
    '微信：有效订单',
    '抖店：有效订单',
  ]
  if (!showUnmatched.value) chips.push('仅看已匹配老师')
  if (selectedTeacher.value !== 'all') chips.push(`老师：${selectedTeacher.value}`)
  if (selectedPlatform.value !== 'all') chips.push(`平台：${selectedPlatform.value}`)
  return chips
})
const teacherRows = computed<TeacherRow[]>(() => {
  const rows = teachers.value.map<TeacherRow>((teacher) => {
    const matched = visibleOrders.value.filter((order) => matchTeacher(order, teacher.name))
    const refunded = orders.value.filter(
      (order) => order.isRefunded && matchTeacher(order, teacher.name),
    ).length
    const target = Number(teacher.target || 0)
    return {
      ...teacher,
      orders: matched.length,
      refunded,
      remaining: Math.max(0, target - matched.length),
      progress: target > 0 ? Math.min(100, Math.round((matched.length / target) * 100)) : 0,
    }
  })

  const matchedIds = new Set<string>()
  for (const teacher of teachers.value) {
    for (const order of visibleOrders.value) {
      if (matchTeacher(order, teacher.name)) matchedIds.add(order.id)
    }
  }
  const unmatched = visibleOrders.value.filter((order) => !matchedIds.has(order.id))
  if (showUnmatched.value && unmatched.length > 0) {
    rows.push({
      id: 'teacher-unmatched',
      name: '未匹配老师',
      target: 0,
      orders: unmatched.length,
      refunded: 0,
      remaining: 0,
      progress: 0,
      locked: true,
    })
  }
  return rows
})
const storeSummaries = computed<StoreSummary[]>(() => {
  const map = new Map<string, StoreSummary>()
  for (const order of orders.value) {
    if (!order.isTransaction && !order.isRefunded) continue
    const key = `${order.platform}:${order.storeId}`
    const existing = map.get(key) || {
      key,
      platform: order.platform,
      name: order.storeName,
      orders: 0,
      refunded: 0,
    }
    if (order.isTransaction && (!excludeRefunded.value || !order.isRefunded)) existing.orders += 1
    if (order.isRefunded) existing.refunded += 1
    map.set(key, existing)
  }
  return Array.from(map.values()).sort(
    (a, b) => b.orders - a.orders || a.name.localeCompare(b.name),
  )
})
const sourceRanking = computed<SourceSummary[]>(() => {
  const map = new Map<string, SourceSummaryAccumulator>()
  for (const order of orders.value) {
    if (!order.isTransaction && !order.isRefunded) continue
    const teacherName = teacherNameForOrder(order)
    if (!showUnmatched.value && teacherName === '未匹配老师') continue
    if (selectedTeacher.value !== 'all' && teacherName !== selectedTeacher.value) continue
    if (selectedPlatform.value !== 'all' && order.platform !== selectedPlatform.value) continue
    const key = sourceAccountKey(order)
    const existing = map.get(key) || {
      key,
      accountKey: key,
      name: order.sourceName,
      teacherName,
      teacherNames: new Set<string>(),
      platform: order.platform,
      platformLabel: order.platform,
      platforms: [],
      platformNames: new Set<string>(),
      storeName: order.storeName,
      storeLabel: order.storeName,
      storeNames: [],
      sourceStoreNames: new Set<string>(),
      operator: sourceOperators.value[key] || '',
      orderIds: [],
      orders: 0,
      refunded: 0,
    }
    existing.teacherNames.add(teacherName)
    existing.platformNames.add(order.platform)
    existing.sourceStoreNames.add(order.storeName)
    if (order.isTransaction && (!excludeRefunded.value || !order.isRefunded)) existing.orders += 1
    existing.orderIds.push(order.id)
    if (order.isRefunded) existing.refunded += 1
    map.set(key, existing)
  }
  const keyword = normalizeText(sourceSearch.value)
  return Array.from(map.values())
    .map((source) => {
      const teacherNames = Array.from(source.teacherNames)
      const platforms = Array.from(source.platformNames)
      const storeNames = Array.from(source.sourceStoreNames)
      return {
        ...source,
        teacherName: compactLabel(teacherNames, '老师'),
        platform: platforms[0] || source.platform,
        platformLabel: compactLabel(platforms, '平台'),
        platforms,
        storeName: storeNames[0] || source.storeName,
        storeLabel: compactLabel(storeNames, '店'),
        storeNames,
      }
    })
    .filter((source) => source.orders > 0 || source.refunded > 0)
    .filter((source) => {
      if (!keyword) return true
      return normalizeText(
        [
          source.name,
          source.teacherName,
          source.platformLabel,
          source.storeLabel,
          source.operator,
        ].join(' '),
      ).includes(keyword)
    })
    .sort((a, b) => b.orders - a.orders || a.teacherName.localeCompare(b.teacherName))
})
const topSources = computed(() => sourceRanking.value.slice(0, 3))
const listSources = computed(() => sourceRanking.value.slice(3))
const selectedSource = computed(
  () => sourceRanking.value.find((source) => source.key === selectedSourceKey.value) || null,
)
const selectedSourceOrders = computed(() => {
  const source = selectedSource.value
  if (!source) return []
  const ids = new Set(source.orderIds)
  return orders.value.filter((order) => ids.has(order.id)).sort((a, b) => b.createTime - a.createTime)
})

function matchTeacher(order: LadderOrder, teacherName: string) {
  const teacher = teachers.value.find((item) => item.name === teacherName)
  if (!teacher) return false
  const haystack = normalizeText(order.teacherText)
  return teacherKeywords(teacher).some((keyword) => haystack.includes(keyword))
}

function teacherNameForOrder(order: LadderOrder) {
  return teachers.value.find((teacher) => matchTeacher(order, teacher.name))?.name || '未匹配老师'
}

function normalizeText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·・_\-—｜|/\\()[\]（）【】,，.。:：;；]/g, '')
}

function sourceAccountKey(order: LadderOrder) {
  return normalizeText(order.sourceName) || normalizeText(order.sourceKey) || order.sourceKey
}

function compactLabel(values: string[], unit: string) {
  const unique = Array.from(new Set(values.filter(Boolean)))
  if (unique.length <= 2) return unique.join('、') || '-'
  return `${unique[0]}等${unique.length}${unit}`
}

function teacherKeywords(teacher: TeacherConfig) {
  return [teacher.name, ...(teacher.keywordsText || '').split(/[,，\n]/)]
    .map((item) => normalizeText(item))
    .filter(Boolean)
}

function loadSourceOperators() {
  try {
    const saved = window.localStorage.getItem(sourceOperatorStorageKey)
    const parsed = saved ? (JSON.parse(saved) as unknown) : null
    sourceOperators.value =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : {}
  } catch {
    sourceOperators.value = {}
  }
}

function persistSourceOperators(next: Record<string, string>) {
  sourceOperators.value = next
  window.localStorage.setItem(sourceOperatorStorageKey, JSON.stringify(next))
}

function openSourceDetail(source: SourceSummary) {
  selectedSourceKey.value = source.key
  sourceOperatorDraft.value = source.operator || ''
  showSourceDetail.value = true
}

function saveSourceOperator() {
  const source = selectedSource.value
  if (!source) return
  const next = { ...sourceOperators.value }
  const operator = sourceOperatorDraft.value.trim()
  if (operator) next[source.accountKey] = operator
  else delete next[source.accountKey]
  persistSourceOperators(next)
  ElMessage.success(operator ? '运营者已保存' : '已清空运营者')
}

function loadTeachers() {
  try {
    const saved = window.localStorage.getItem(teacherStorageKey.value)
    const parsed = saved ? (JSON.parse(saved) as unknown) : null
    const savedTeachers = Array.isArray(parsed) ? (parsed as TeacherConfig[]) : []
    teachers.value =
      savedTeachers.length > 0
        ? savedTeachers.map((teacher) => ({
            ...teacher,
            target: Number(teacher.target || 0),
            keywordsText:
              teacher.keywordsText ||
              DEFAULT_TEACHERS.find(
                (defaultTeacher) =>
                  defaultTeacher.id === teacher.id || defaultTeacher.name === teacher.name,
              )?.keywordsText ||
              '',
          }))
        : DEFAULT_TEACHERS.map((teacher) => ({ ...teacher }))
  } catch {
    teachers.value = DEFAULT_TEACHERS.map((teacher) => ({ ...teacher }))
  }
}

function saveTeachers() {
  window.localStorage.setItem(
    teacherStorageKey.value,
    JSON.stringify(
      teachers.value
        .filter((teacher) => teacher.name.trim())
        .map((teacher) => ({ ...teacher, target: Number(teacher.target || 0) })),
    ),
  )
}

function addTeacher() {
  teachers.value.push({ id: `teacher-${Date.now()}`, name: '', target: 1600, keywordsText: '' })
  saveTeachers()
}

function removeTeacher(id: string) {
  teachers.value = teachers.value.filter((teacher) => teacher.id !== id)
  saveTeachers()
}

function toggleRefunds() {
  excludeRefunded.value = !excludeRefunded.value
}

function teacherStatusText(teacher: TeacherRow) {
  if (teacher.locked) return '待整理归因'
  if (teacher.progress >= 100) return '目标已完成'
  if (teacher.progress >= 70) return '冲刺状态良好'
  if (teacher.progress >= 35) return '稳步推进中'
  return '需要重点补量'
}

function teacherTagType(teacher: TeacherRow) {
  if (teacher.progress >= 100) return 'success'
  if (teacher.progress >= 70) return 'primary'
  if (teacher.progress >= 35) return 'warning'
  return 'danger'
}

function rankIcon(index: number) {
  return ['🏆', '🥈', '🥉'][index] || String(index + 1)
}

function rankLabel(index: number) {
  return ['销冠', 'Top2', 'Top3'][index] || `Top${index + 1}`
}

function rankTagType(index: number) {
  return index === 0 ? 'warning' : index === 1 ? 'success' : 'primary'
}

function centToYuan(value: number) {
  return (Number(value || 0) / 100).toFixed(2)
}

function fmtTime(timestamp: number) {
  return timestamp ? dayjs.unix(timestamp).format('MM-DD HH:mm') : '-'
}

function isWechatTransaction(order: WechatOrder) {
  return ![10, 12, 200, 250].includes(Number(order.status))
}

function isWechatRefunded(order: WechatOrder, refundedOrderIds: Set<string>) {
  return Number(order.status) === 200 || refundedOrderIds.has(String(order.order_id))
}

function isWechatSuccessfulAftersale(item: WechatAftersale) {
  return item.status === 'MERCHANT_REFUND_SUCCESS' && Number(item.amount || 0) > 0
}

function primaryWechatSource(order: WechatOrder): WechatOrderSourceInfo | null {
  return order.source_infos?.find((source) => source.account_nickname || source.account_id) || null
}

function wechatTeacherText(order: WechatOrder, storeName: string) {
  const source = primaryWechatSource(order)
  return [source?.account_nickname, source?.account_id, order.product_title, storeName]
    .filter(Boolean)
    .join(' ')
}

function wechatSourceName(order: WechatOrder, storeName: string) {
  const source = primaryWechatSource(order)
  return source?.account_nickname || source?.account_id || `${storeName}自卖`
}

function wechatSourceKey(order: WechatOrder, storeName: string) {
  const source = primaryWechatSource(order)
  return source?.account_id || source?.account_nickname || `store:${storeName}`
}

function wechatSourceLabel(order: WechatOrder, storeName: string) {
  const source = primaryWechatSource(order)
  const name = source?.account_nickname || source?.account_id || `${storeName}自卖`
  const type = wechatSourceTypeLabel(source?.account_type || (source ? '' : 'store'))
  return [name, type].filter(Boolean).join(' · ')
}

function wechatSourceTypeLabel(type: string) {
  const labels: Record<string, string> = {
    '1': '视频号',
    '5': '带货达人',
    store: '店铺',
  }
  return labels[type] || ''
}

function wechatStatusLabel(status: number) {
  const labels: Record<number, string> = {
    10: '待付款',
    12: '待收款',
    20: '待发货',
    21: '部分发货',
    30: '待收货',
    100: '已完成',
    200: '全部退款',
    250: '已取消',
  }
  return labels[status] || `状态${status}`
}

function wechatStatusClass(status: number) {
  if (status === 200 || status === 250) return 'is-cancel'
  if (status === 100) return 'is-done'
  if (status >= 30) return 'is-shipping'
  if (status >= 20) return 'is-paid'
  if (status >= 10) return 'is-pending'
  return 'is-cancel'
}

function isDoudianRefunded(order: DoudianOrderMetric, refundedOrderIds: Set<string>) {
  return refundedOrderIds.has(String(order.order_id))
}

function doudianTeacherText(order: DoudianOrderMetric, storeName: string) {
  return [order.author_name, order.author_id, order.author_source, order.product_title, storeName]
    .filter(Boolean)
    .join(' ')
}

function doudianSourceName(order: DoudianOrderMetric, storeName: string) {
  return order.author_name || order.author_id || `${storeName}自卖`
}

function doudianSourceKey(order: DoudianOrderMetric, storeName: string) {
  return order.author_id || order.author_name || `store:${storeName}`
}

function doudianSourceLabel(order: DoudianOrderMetric, storeName: string) {
  return [order.author_name || order.author_id || `${storeName}自卖`, order.author_source]
    .filter(Boolean)
    .join(' · ')
}

function doudianStatusClass(order: DoudianOrderMetric) {
  const label = doudianOrderStatus(order)
  if (label.includes('退') || label.includes('关') || label.includes('取')) return 'is-cancel'
  if (label.includes('完成')) return 'is-done'
  if (label.includes('发货') || label.includes('收货')) return 'is-shipping'
  if (label.includes('待')) return 'is-pending'
  return 'is-paid'
}

function hideImg(event: Event) {
  ;(event.target as HTMLImageElement).style.display = 'none'
}

async function loadWechatStoreOrders(store: WechatStore, start: number, end: number) {
  const [orderRes, aftersaleRes] = await Promise.all([
    wechatStoreApi.getOrders(store.id, { page_size: 5000, start_time: start, end_time: end }),
    wechatStoreApi.getAftersaleCount?.(store.id, {
      begin_create_time: start,
      end_create_time: end,
    }) || Promise.resolve(null),
  ])
  const storeOrders =
    orderRes.data?.errcode === 0 ? ((orderRes.data.order_list || []) as WechatOrder[]) : []
  const aftersales =
    aftersaleRes?.data?.errcode === 0
      ? normalizeAftersales((aftersaleRes.data.list || []) as WechatAftersale[])
      : []
  const refundedOrderIds = new Set(
    aftersales
      .filter((item) => isWechatSuccessfulAftersale(item) && item.order_id)
      .map((item) => String(item.order_id)),
  )

  return storeOrders.map<LadderOrder>((order) => ({
    id: `wechat:${store.id}:${order.order_id}`,
    orderNo: String(order.order_id),
    platform: '微信小店',
    storeId: store.id,
    storeName: store.name,
    sourceName: wechatSourceName(order, store.name),
    sourceKey: wechatSourceKey(order, store.name),
    sourceLabel: wechatSourceLabel(order, store.name),
    teacherText: wechatTeacherText(order, store.name),
    productTitle: order.product_title,
    productImg: order.product_img,
    createTime: Number(order.create_time || 0),
    amount: Number(order.product_price || order.pay_amount || 0),
    statusLabel: wechatStatusLabel(Number(order.status)),
    statusClass: wechatStatusClass(Number(order.status)),
    shipped: Number(order.ship_time || 0) > 0,
    isTransaction: isWechatTransaction(order),
    isRefunded: isWechatRefunded(order, refundedOrderIds),
  }))
}

async function loadDoudianStoreOrders(store: DoudianStore, start: number, end: number) {
  const [orderRes, aftersaleRes] = await Promise.all([
    doudianStoreApi.getOrders(store.id, { start_time: start, end_time: end }),
    doudianStoreApi.getAftersales(store.id, {
      begin_create_time: start,
      end_create_time: end,
    }),
  ])
  const storeOrders = (orderRes.data?.order_list || []) as DoudianOrderMetric[]
  const aftersales = (aftersaleRes.data?.list || []) as DoudianAftersaleMetric[]
  const refundedOrderIds = new Set(
    aftersales
      .filter((item) => isDoudianSuccessfulRefund(item) && item.order_id)
      .map((item) => String(item.order_id)),
  )
  const revenueOrderIds = new Set(
    getDoudianRevenueOrders(storeOrders, getDoudianSuccessfulRefundOrderIds(aftersales)).map(
      (order) => String(order.order_id),
    ),
  )

  return storeOrders.map<LadderOrder>((order) => ({
    id: `doudian:${store.id}:${order.order_id}`,
    orderNo: String(order.order_id),
    platform: '抖店',
    storeId: store.id,
    storeName: store.name,
    sourceName: doudianSourceName(order, store.name),
    sourceKey: doudianSourceKey(order, store.name),
    sourceLabel: doudianSourceLabel(order, store.name),
    teacherText: doudianTeacherText(order, store.name),
    productTitle: order.product_title || '未知商品',
    productImg: order.product_img,
    createTime: Number(order.create_time || 0),
    amount: Number(order.pay_amount || 0),
    statusLabel: doudianOrderStatus(order),
    statusClass: doudianStatusClass(order),
    shipped: false,
    isTransaction: revenueOrderIds.has(String(order.order_id)),
    isRefunded: isDoudianRefunded(order, refundedOrderIds),
  }))
}

async function loadData() {
  loading.value = true
  try {
    const { start, end } = getCurrentMonthRange()
    const [wechatStoresRes, doudianStoresRes] = await Promise.all([
      wechatStoreApi.getStores(),
      doudianStoreApi.getStores(),
    ])
    const wechatStores = Array.isArray(wechatStoresRes.data) ? wechatStoresRes.data : []
    const doudianStores = Array.isArray(doudianStoresRes.data) ? doudianStoresRes.data : []
    const results = await Promise.allSettled([
      ...wechatStores.map((store) => loadWechatStoreOrders(store, start, end)),
      ...doudianStores.map((store) => loadDoudianStoreOrders(store, start, end)),
    ])
    orders.value = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    const failed = results.filter((result) => result.status === 'rejected').length
    if (failed > 0) ElMessage.warning(`${failed} 家店铺订单读取失败，其余店铺已汇总`)
  } catch (error: any) {
    orders.value = []
    ElMessage.error(error?.message || '业绩天梯数据加载失败')
  } finally {
    loading.value = false
  }
}

watch(teacherStorageKey, loadTeachers, { immediate: true })

onMounted(() => {
  loadSourceOperators()
  void loadData()
})
</script>

<style scoped lang="scss">
.performance-page {
  max-width: 1280px;
  margin: 0 auto;
  padding-bottom: $space-12;
  display: flex;
  flex-direction: column;
  gap: $space-5;
}

.hero-card,
.teacher-board,
.section-card {
  @include card;
}

.hero-card {
  position: relative;
  overflow: hidden;
  padding: $space-6;
  border-color: rgba($accent-400, 0.3);
  background:
    radial-gradient(circle at 12% 0%, rgba($accent-500, 0.25), transparent 34%),
    radial-gradient(circle at 100% 10%, rgba($color-warning, 0.12), transparent 28%),
    rgba($bg-elevated, 0.98);

  &__header,
  &__body {
    position: relative;
    z-index: 1;
  }

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: $space-5;
    flex-wrap: wrap;
  }

  &__eyebrow {
    color: $accent-300;
    font-size: $text-xs;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  &__title {
    margin: $space-1 0 0;
    color: $text-primary;
    font-size: 34px;
    font-weight: 800;
    letter-spacing: -0.04em;
  }

  &__subtitle {
    max-width: 680px;
    margin: $space-2 0 0;
    color: $text-secondary;
    font-size: $text-sm;
    line-height: 1.7;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: $space-2;
  }

  &__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 420px;
    gap: $space-6;
    margin-top: $space-6;
  }

  &__progress-panel {
    min-width: 0;
  }

  &__score {
    display: flex;
    align-items: baseline;
    gap: $space-2;
    margin-bottom: $space-4;

    strong {
      color: $text-primary;
      font-family: $font-mono;
      font-size: 56px;
      line-height: 0.95;
      letter-spacing: -0.06em;
    }

    span {
      color: $text-tertiary;
      font-family: $font-mono;
      font-size: 18px;
    }
  }

  &__progress {
    max-width: 720px;
  }

  &__progress-meta {
    display: flex;
    justify-content: space-between;
    max-width: 720px;
    margin-top: $space-3;
    color: $text-tertiary;
    font-size: $text-xs;
  }

  &__metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: $space-3;
  }

  @media (max-width: 1000px) {
    &__body {
      grid-template-columns: 1fr;
    }

    &__metrics {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    padding: $space-5;

    &__score strong {
      font-size: 42px;
    }

    &__metrics {
      grid-template-columns: 1fr;
    }
  }
}

.metric-tile {
  padding: $space-4;
  border: 1px solid rgba($accent-400, 0.22);
  border-radius: $radius-lg;
  background: rgba($bg-hover, 0.44);

  span,
  em {
    display: block;
    color: $text-tertiary;
    font-size: $text-xs;
    font-style: normal;
  }

  strong {
    display: block;
    margin: $space-2 0 $space-1;
    color: $text-primary;
    font-family: $font-mono;
    font-size: 28px;
    line-height: 1;
  }
}

.filter-bar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: $space-2;
  flex-wrap: wrap;
  margin-top: $space-5;
  padding-top: $space-5;
  border-top: 1px solid rgba($border-subtle, 0.75);

  &__select {
    width: 132px;
  }

  &__chip {
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba($accent-500, 0.12);
    color: $accent-200;
    font-size: $text-micro;
  }
}

.section-title,
.section-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: $space-3;
}

.section-title {
  padding: $space-5 $space-5 $space-3;

  h3 {
    margin: 0;
    color: $text-primary;
    font-size: 18px;
  }

  p {
    margin: 4px 0 0;
    color: $text-tertiary;
    font-size: $text-xs;
  }
}

.teacher-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $space-4;
  padding: $space-3 $space-5 $space-5;
  min-height: 180px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.teacher-card {
  padding: $space-5;
  border: 1px solid rgba($accent-400, 0.24);
  border-radius: $radius-lg;
  background: linear-gradient(135deg, rgba($accent-500, 0.12), rgba($bg-hover, 0.38));

  &--muted {
    border-color: rgba($color-warning, 0.35);
    background: rgba($color-warning, 0.08);
  }

  &__top,
  &__foot {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: $space-3;
  }

  &__name {
    color: $text-primary;
    font-size: 20px;
    font-weight: 800;
  }

  &__status {
    margin-top: 3px;
    color: $text-tertiary;
    font-size: $text-xs;
  }

  &__numbers {
    display: flex;
    align-items: baseline;
    gap: $space-2;
    margin: $space-5 0 $space-4;

    strong {
      color: $text-primary;
      font-family: $font-mono;
      font-size: 40px;
      line-height: 1;
    }

    span {
      color: $text-tertiary;
      font-family: $font-mono;
      font-size: $text-sm;
    }
  }

  &__foot {
    margin-top: $space-3;
    color: $text-tertiary;
    font-size: $text-xs;
  }
}

.section-card {
  overflow: hidden;

  &--compact {
    opacity: 0.92;
  }

  &__header {
    padding: $space-4 $space-5;
    border-bottom: 1px solid var(--el-border-color-lighter);
    color: $text-primary;
    font-weight: 700;
  }

  &__meta {
    color: $text-tertiary;
    font-size: $text-xs;
    font-weight: 400;
  }

  &__tools {
    display: flex;
    align-items: center;
    gap: $space-2;
  }

  &__search {
    width: 220px;
  }
}

.source-board {
  padding: $space-5;
  min-height: 240px;
}

.podium {
  display: grid;
  grid-template-columns: 1.24fr 1fr 1fr;
  gap: $space-4;
  margin-bottom: $space-4;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
}

.podium-card {
  position: relative;
  min-height: 170px;
  padding: $space-5;
  border: 1px solid rgba($accent-400, 0.38);
  border-radius: $radius-lg;
  background: linear-gradient(135deg, rgba($accent-500, 0.18), rgba($bg-hover, 0.45));
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 0.18s $ease-out,
    box-shadow 0.18s $ease-out,
    transform 0.18s $ease-out;

  &:hover,
  &:focus-visible {
    border-color: rgba($accent-300, 0.8);
    box-shadow: 0 18px 40px rgba($accent-500, 0.14);
    transform: translateY(-2px);
    outline: none;
  }

  &--1 {
    border-color: rgba($color-warning, 0.8);
    background:
      radial-gradient(circle at 88% 0%, rgba($color-warning, 0.26), transparent 34%),
      linear-gradient(135deg, rgba($color-warning, 0.16), rgba($accent-500, 0.14));
  }

  &--2 {
    border-color: rgba($color-success, 0.55);
  }

  &--3 {
    border-color: rgba($accent-400, 0.72);
  }

  &__badge {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: $space-4;
    border-radius: 999px;
    background: rgba($bg-elevated, 0.6);
    font-size: 24px;
  }

  h3 {
    max-width: 100%;
    margin: $space-3 0 $space-1;
    overflow: hidden;
    color: $text-primary;
    font-size: 18px;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  p {
    margin: 0;
    color: $text-tertiary;
    font-size: $text-xs;
  }

  &__operator {
    margin-top: $space-1 !important;
    color: $accent-200 !important;
  }

  &__orders {
    position: absolute;
    right: $space-5;
    bottom: $space-5;
    display: grid;
    justify-items: end;
    gap: 2px;
    font-family: $font-mono;

    strong {
      color: $text-primary;
      font-size: 38px;
      line-height: 1;
    }

    span,
    em {
      color: $text-tertiary;
      font-size: $text-micro;
      font-style: normal;
    }

    em {
      color: $color-danger;
    }
  }
}

.source-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $space-3;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.source-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: $space-3;
  padding: $space-4;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: $radius-md;
  background: rgba($bg-hover, 0.38);
  cursor: pointer;
  transition:
    border-color 0.15s $ease-out,
    background 0.15s $ease-out,
    transform 0.15s $ease-out;

  &:hover,
  &:focus-visible {
    border-color: rgba($accent-400, 0.55);
    background: rgba($accent-500, 0.1);
    transform: translateY(-1px);
    outline: none;
  }

  &__rank {
    width: 30px;
    height: 30px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba($accent-500, 0.14);
    color: $accent-300;
    font-family: $font-mono;
    font-size: $text-xs;
    font-weight: 700;
  }

  &__main {
    min-width: 0;
  }

  &__name {
    overflow: hidden;
    color: $text-primary;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: $space-2;
    margin-top: 4px;
    color: $text-tertiary;
    font-size: $text-micro;
  }

  &__stats {
    display: grid;
    justify-items: end;
    gap: 2px;
    font-family: $font-mono;
    white-space: nowrap;

    strong {
      color: $text-primary;
      font-size: 22px;
      line-height: 1;
    }

    span,
    small {
      color: $text-tertiary;
      font-size: $text-micro;
    }

    small {
      color: $color-danger;
    }
  }
}

.store-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: $space-3;
  padding: $space-5;
  min-height: 160px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.store-card {
  padding: $space-4;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: $radius-md;
  background: rgba($bg-hover, 0.32);

  &__top,
  &__stats {
    display: flex;
    justify-content: space-between;
    gap: $space-3;
  }

  &__top {
    color: $text-primary;

    span {
      color: $text-tertiary;
      font-size: $text-xs;
      flex-shrink: 0;
    }
  }

  &__stats {
    margin-top: $space-3;
    color: $text-tertiary;
    font-size: $text-xs;

    em {
      color: $color-danger;
      font-style: normal;
    }
  }
}

.rules-panel {
  display: flex;
  flex-direction: column;
  gap: $space-4;

  &__hint {
    margin: 0;
    color: $text-tertiary;
    font-size: $text-sm;
    line-height: 1.7;
  }

  &__add {
    width: 100%;
  }
}

.rule-card {
  display: flex;
  flex-direction: column;
  gap: $space-3;
  padding: $space-4;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: $radius-lg;
  background: rgba($bg-hover, 0.36);

  &__header,
  &__target {
    display: flex;
    align-items: center;
    gap: $space-2;
  }

  &__target {
    color: $text-tertiary;
    font-size: $text-xs;
  }
}

.source-detail {
  display: flex;
  flex-direction: column;
  gap: $space-5;

  &__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: $space-4;
    padding: $space-5;
    border: 1px solid rgba($accent-400, 0.34);
    border-radius: $radius-lg;
    background:
      radial-gradient(circle at 100% 0%, rgba($accent-500, 0.18), transparent 36%),
      rgba($bg-hover, 0.36);

    span,
    p {
      color: $text-tertiary;
      font-size: $text-xs;
    }

    h3 {
      margin: $space-1 0;
      color: $text-primary;
      font-size: 22px;
      font-weight: 800;
    }

    p {
      margin: 0;
    }

    strong {
      color: $text-primary;
      font-family: $font-mono;
      font-size: 34px;
      line-height: 1;
      white-space: nowrap;
    }
  }

  &__operator {
    display: flex;
    flex-direction: column;
    gap: $space-2;

    > span {
      color: $text-secondary;
      font-size: $text-sm;
      font-weight: 700;
    }

    > div {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: $space-2;
    }
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: $space-3;

    div {
      padding: $space-4;
      border: 1px solid var(--el-border-color-lighter);
      border-radius: $radius-md;
      background: rgba($bg-hover, 0.3);
    }

    span {
      display: block;
      color: $text-tertiary;
      font-size: $text-xs;
    }

    strong {
      display: block;
      margin-top: $space-1;
      color: $text-primary;
      font-family: $font-mono;
      font-size: 24px;
    }
  }

  &__section-title {
    margin-bottom: $space-3;
    color: $text-primary;
    font-weight: 800;
  }

  &__orders {
    display: flex;
    flex-direction: column;
    gap: $space-2;
  }

  &__order {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: $space-4;
    padding: $space-4 0;
    border-bottom: 1px solid var(--el-border-color-lighter);

    &:last-child {
      border-bottom: 0;
    }
  }

  &__order-img {
    width: 44px;
    height: 44px;
    flex: 0 0 44px;
    border-radius: $radius-sm;
    object-fit: cover;
    background: rgba($bg-hover, 0.5);
  }

  &__order-info {
    min-width: 0;
    flex: 1;

    strong {
      display: block;
      overflow: hidden;
      color: $text-primary;
      font-size: $text-sm;
      font-weight: 800;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__order-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: $space-2;
    margin-top: 4px;
    color: $text-tertiary;
    font-size: $text-xs;
  }

  &__order-status,
  &__order-shipped {
    padding: 1px 8px;
    border-radius: $radius-full;
    font-size: $text-micro;
    font-weight: 700;
  }

  &__order-status {
    color: $accent-200;
    background: rgba($accent-500, 0.14);

    &.is-done {
      color: $color-success;
      background: rgba($color-success, 0.14);
    }

    &.is-shipping,
    &.is-paid {
      color: $accent-200;
      background: rgba($accent-500, 0.14);
    }

    &.is-pending {
      color: $color-warning;
      background: rgba($color-warning, 0.14);
    }

    &.is-cancel {
      color: $color-danger;
      background: rgba($color-danger, 0.12);
    }
  }

  &__order-shipped {
    color: $color-success;
    background: rgba($color-success, 0.12);
  }

  &__order-source {
    margin-top: $space-1;
    overflow: hidden;
    color: $accent-200;
    font-size: $text-xs;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__order-price {
    flex-shrink: 0;
    color: $text-primary;
    font-family: $font-mono;
    font-size: 18px;
    font-weight: 900;
    white-space: nowrap;
  }
}

.empty-hint {
  padding: $space-8 $space-6;
  color: $text-tertiary;
  text-align: center;
  grid-column: 1 / -1;
}
</style>
