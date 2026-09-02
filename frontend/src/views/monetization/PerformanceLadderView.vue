<template>
  <div class="performance-page">
    <section class="hero-card">
      <div class="hero-card__header">
        <div>
          <div class="hero-card__eyebrow">
            <MonthSwitcher
              v-model="selectedMonth"
              :current-month="todayMonth"
              @change="handleMonthChange"
            />
            <span class="hero-card__eyebrow-divider">·</span>
            <span class="hero-card__eyebrow-text">全店铺有效订单</span>
            <span v-if="snapshotNote" class="hero-card__snapshot-note" :title="snapshotNote">
              {{ snapshotNote }}
            </span>
          </div>
          <h2 class="hero-card__title">业绩天梯</h2>
          <p class="hero-card__subtitle">
            按老师归因看所选月份的订单完成情况，默认隐藏未匹配来源，避免鱼龙混杂的数据干扰判断。
          </p>
        </div>
        <div class="hero-card__actions">
          <span class="hero-card__rule-updated">{{ ladderRuleUpdatedText }}</span>
          <el-button text size="small" @click="showRules = true">调整归因规则</el-button>
          <el-button :icon="Refresh" circle size="small" :loading="loading" @click="loadMonthData" />
        </div>
      </div>

      <div v-loading="loading" class="hero-card__body">
        <div class="hero-card__progress-panel">
          <!-- 当前月：冲刺进度（已完成/还差/剩余日均/剩余天数） -->
          <template v-if="!isHistoricalMonth">
            <div class="hero-card__score">
              <strong><AnimatedNumber :value="totalCurrentOrders" :duration="280" /></strong>
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
          </template>

          <!-- 历史月：月度结果（最终完成/目标/完成率/是否达标），不再计算剩余天数与剩余日均 -->
          <template v-else>
            <div class="hero-card__score">
              <strong><AnimatedNumber :value="totalCurrentOrders" :duration="280" /></strong>
              <span>/ {{ totalTargetOrders }} 单</span>
              <el-tag
                size="small"
                effect="dark"
                class="hero-card__goal-tag"
                :type="isMonthGoalReached ? 'success' : 'danger'"
              >
                {{ isMonthGoalReached ? '已达标' : '未达标' }}
              </el-tag>
            </div>
            <el-progress
              :percentage="Math.min(100, finalCompletionRate)"
              :stroke-width="16"
              :show-text="false"
              class="hero-card__progress"
            />
            <div class="hero-card__progress-meta">
              <span>最终完成 {{ totalCurrentOrders }} 单</span>
              <span>完成率 {{ finalCompletionRate }}%</span>
            </div>
          </template>
        </div>

        <div class="hero-card__metrics">
          <div class="metric-tile">
            <span>总订单</span>
            <strong><AnimatedNumber :value="totalOrderCount" :duration="280" /></strong>
            <em>有效 {{ totalCurrentOrders }} + 退款 {{ totalRefundedOrders }}</em>
          </div>
          <div v-if="!isHistoricalMonth" class="metric-tile">
            <span>剩余日均</span>
            <strong><AnimatedNumber :value="dailyRequiredOrders" :duration="280" /></strong>
            <em>剩余 {{ daysRemaining }} 天</em>
          </div>
          <div v-else class="metric-tile">
            <span>完成率</span>
            <strong>{{ finalCompletionRate }}%</strong>
            <em>{{ isMonthGoalReached ? '已达标' : '未达标' }}</em>
          </div>
          <div class="metric-tile">
            <span>有效订单</span>
            <strong>{{ totalCurrentOrders }}</strong>
            <em>去退款</em>
          </div>
          <div class="metric-tile">
            <span>覆盖店铺</span>
            <strong>{{ storeSummaries.length }}</strong>
            <em>家</em>
          </div>
        </div>
      </div>

      <el-alert
        v-if="monthError"
        :title="monthError"
        type="error"
        :closable="false"
        show-icon
        class="hero-card__month-error"
      />

      <div class="filter-bar">
        <el-select v-model="selectedTeacher" size="small" class="filter-bar__select">
          <el-option label="全部老师" value="all" />
          <el-option
            v-for="teacher in effectiveTeachers"
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
          type="primary"
          size="small"
          disabled
        >
          按有效订单
        </el-button>
        <el-button
          :type="showUnmatched ? 'warning' : 'default'"
          size="small"
          @click="toggleUnmatched"
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
              {{ isHistoricalMonth ? teacher.completionRate : teacher.progress }}%
            </el-tag>
          </div>
          <div class="teacher-card__numbers">
            <strong>{{ teacher.validOrderCount }}</strong>
            <span>/ {{ teacher.target }} 单</span>
          </div>
          <el-progress
            :percentage="Math.min(100, teacher.progress)"
            :stroke-width="10"
            :show-text="false"
          />
          <!-- 历史月：最终完成/完成率/是否达标，不再显示“还差 X 单” -->
          <div v-if="isHistoricalMonth" class="teacher-card__foot">
            <span>完成率 {{ teacher.completionRate }}%</span>
            <span
              :class="teacher.completionRate >= 100 ? 'teacher-card__reached' : 'teacher-card__missed'"
            >
              {{ teacher.completionRate >= 100 ? '已达标' : '未达标' }}
            </span>
            <span>总订单 {{ teacher.totalOrderCount }} 单</span>
            <span v-if="teacher.refundedOrderCount > 0">退款 {{ teacher.refundedOrderCount }} 单</span>
          </div>
          <div v-else class="teacher-card__foot">
            <span>还差 {{ teacher.remaining }} 单</span>
            <span>总订单 {{ teacher.totalOrderCount }} 单</span>
            <span v-if="teacher.refundedOrderCount > 0">退款 {{ teacher.refundedOrderCount }} 单</span>
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
              <h3 :title="source.name">{{ source.name }}</h3>
              <p :title="source.teacherName + ' · ' + source.platformLabel + ' · ' + source.storeLabel">
                {{ source.teacherName }} · {{ source.platformLabel }} · {{ source.storeLabel }}
              </p>
              <p
                class="podium-card__operator"
                :title="source.operator || (source.accountId ? '账号已匹配 · 未设置主负责人' : '未匹配账号')"
              >
                <template v-if="source.operator">
                  运营者：{{ source.operator }}
                  <em v-if="source.operatorSource === 'account'" class="operator-origin">主负责人</em>
                  <em v-else-if="source.operatorSource === 'legacy'" class="operator-origin">历史配置</em>
                </template>
                <template v-else-if="source.accountId">账号已匹配 · 未设置主负责人</template>
                <template v-else>未匹配账号</template>
              </p>
            </div>
            <div class="podium-card__orders">
              <strong>{{ source.validOrderCount }}</strong>
              <span>单</span>
              <em>总订单 {{ source.totalOrderCount }} · 退款 {{ source.refundedOrderCount }}</em>
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
                <div class="source-row__name" :title="source.name">{{ source.name }}</div>
              </div>
              <div class="source-row__meta">
                <span :title="source.teacherName">{{ source.teacherName }}</span>
                <span :title="source.platformLabel">{{ source.platformLabel }}</span>
                <span :title="source.storeLabel">{{ source.storeLabel }}</span>
                <span
                  :title="source.operator || (source.accountId ? '未设置主负责人' : '未匹配账号')"
                >
                  <template v-if="source.operator">运营者：{{ source.operator }}</template>
                  <template v-else-if="source.accountId">未设置主负责人</template>
                  <template v-else>未匹配账号</template>
                </span>
              </div>
            </div>
            <div class="source-row__stats">
              <strong>{{ source.validOrderCount }}</strong>
              <span>单</span>
              <small>总订单 {{ source.totalOrderCount }} · 退款 {{ source.refundedOrderCount }}</small>
            </div>
          </div>
        </div>
        <div v-if="sourceRanking.length === 0" class="empty-hint">
          {{ loading ? '正在读取出单来源…' : '暂无该月出单来源' }}
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
            <span>去退款 {{ store.validOrderCount }} 单</span>
            <em>总订单 {{ store.totalOrderCount }} · 退款 {{ store.refundedOrderCount }}</em>
          </div>
        </div>
        <div v-if="storeSummaries.length === 0" class="empty-hint">
          {{ loading ? '正在读取店铺订单…' : '暂无该月店铺订单' }}
        </div>
      </div>
    </div>

    <el-drawer v-model="showRules" title="归因规则与目标" size="520px">
      <div class="rules-panel">
        <el-alert
          v-if="isHistoricalMonth"
          type="warning"
          :closable="false"
          show-icon
          class="rules-panel__month-hint"
          :title="`正在查看历史月 ${monthLabelText} 的冻结快照，此处修改只会保存到当前月（${todayMonthLabel}）配置。`"
        />
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
          <strong>{{ selectedSource.validOrderCount }} 单</strong>
        </div>

        <div class="source-detail__operator">
          <span>运营者</span>
          <div class="source-detail__operator-value">
            <template v-if="selectedSource.operator">
              <strong>{{ selectedSource.operator }}</strong>
              <el-tag
                v-if="selectedSource.operatorSource === 'account'"
                size="small"
                type="success"
              >
                来自账号主负责人
              </el-tag>
              <el-tag v-else-if="selectedSource.operatorSource === 'legacy'" size="small" type="info">
                历史配置
              </el-tag>
              <p v-if="selectedSource.operatorSource === 'account'" class="source-detail__operator-hint">
                已自动同步「账号接入」中该账号的主负责人，无需重复设置。
              </p>
            </template>
            <template v-else-if="selectedSource.accountId">
              <strong>未设置主负责人</strong>
              <p class="source-detail__operator-hint">
                该来源已对应到「账号接入」中的账号，但该账号尚未设置主负责人。请到「账号接入」设置后，这里会自动同步。
              </p>
            </template>
            <template v-else>
              <strong>未匹配账号</strong>
              <p class="source-detail__operator-hint">
                该来源尚未对应到「账号接入」中的账号。请先接入对应账号并设置主负责人，这里会自动同步。
              </p>
            </template>
          </div>
        </div>

        <div class="source-detail__stats">
          <div>
            <span>总订单</span>
            <strong>{{ selectedSource.totalOrderCount }}</strong>
          </div>
          <div>
            <span>有效订单</span>
            <strong>{{ selectedSource.validOrderCount }}</strong>
          </div>
          <div>
            <span>退款订单</span>
            <strong>{{ selectedSource.refundedOrderCount }}</strong>
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
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { doudianStoreApi, type DoudianStore } from '@/api/doudian-store'
import {
  performanceLadderApi,
  type PerformanceLadderConfigResponse,
  type PerformanceLadderMonthSnapshotResponse,
  type PerformanceLadderTeacherDto,
} from '@/api/performance-ladder'
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
import { accountsApi } from '@/api/accounts'
import { useLoadingStore } from '@/store/loading'
import AnimatedNumber from '@/components/common/AnimatedNumber.vue'
import MonthSwitcher from '@/components/common/MonthSwitcher.vue'
import {
  currentMonth,
  daysRemainingForMonth,
  isCurrentMonth,
  monthLabel,
  monthRange,
  normalizeMonthParam,
} from '@/utils/monthRange'
import { createLatestRequestGuard } from '@/utils/requestGuard'
import type { Account } from '@/types'

interface TeacherConfig {
  id: string
  name: string
  target: number
  keywordsText?: string
}

interface TeacherRow extends TeacherConfig {
  totalOrderCount: number
  validOrderCount: number
  refundedOrderCount: number
  remaining: number
  progress: number
  /** 不封顶的最终完成率（历史月展示真实结果用） */
  completionRate: number
  locked?: boolean
}

interface StoreSummary {
  key: string
  platform: string
  name: string
  totalOrderCount: number
  validOrderCount: number
  refundedOrderCount: number
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
  operatorSource: 'account' | 'legacy' | null
  accountId: string
  orderIds: string[]
  totalOrderCount: number
  validOrderCount: number
  refundedOrderCount: number
}

interface SourceSummaryAccumulator extends SourceSummary {
  teacherNames: Set<string>
  platformNames: Set<string>
  sourceStoreNames: Set<string>
  sourceAccountIds: Set<string>
}

interface LadderOrder {
  id: string
  orderNo: string
  platform: string
  storeId: string
  storeName: string
  sourceName: string
  sourceKey: string
  sourceAccountId: string
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
const excludeRefunded = ref(true)
const showUnmatched = ref(false)
const showRules = ref(false)
const showSourceDetail = ref(false)
const selectedTeacher = ref('all')
const selectedPlatform = ref('all')
const selectedSourceKey = ref('')
const sourceSearch = ref('')
const sourceOperators = ref<Record<string, string>>({})
const sourceAccounts = ref<Account[]>([])
const teachers = ref<TeacherConfig[]>([])
const orders = ref<LadderOrder[]>([])
const ladderConfigInitialized = ref(false)
const ladderRuleUpdatedAt = ref<string | null>(null)
const ladderRuleUpdatedBy = ref('')

// ── 月份作为页面统一参数（YYYY-MM）──────────────────────────────
const route = useRoute()
const router = useRouter()
const todayMonth = ref(currentMonth())
// URL ?month=YYYY-MM 优先；非法/未来月份回落当前自然月
const selectedMonth = ref(normalizeMonthParam(route.query.month) ?? todayMonth.value)
const monthError = ref('')
const monthSnapshot = ref<PerformanceLadderMonthSnapshotResponse | null>(null)
const snapshotFallback = ref(false)
// 防串月：快速连续切月时，只有最新一次请求允许写页面数据
const orderLoadGuard = createLatestRequestGuard()

const teacherStorageKey = computed(() => `performance-ladder-teachers:${dayjs().format('YYYY-MM')}`)
const sourceOperatorStorageKey = 'performance-ladder-source-operators'

// 账号接入数据索引：用于把出单来源统一关联到账号的「主负责人」
const sourceAccountIdIndex = computed(() => {
  const map = new Map<string, Account[]>()
  for (const account of sourceAccounts.value) {
    const key = normalizeText(account.platformUserId || '')
    if (!key) continue
    const list = map.get(key) || []
    list.push(account)
    map.set(key, list)
  }
  return map
})

const sourceAccountNameIndex = computed(() => {
  const map = new Map<string, Account[]>()
  for (const account of sourceAccounts.value) {
    const key = normalizeText(account.nickname || '')
    if (!key) continue
    const list = map.get(key) || []
    list.push(account)
    map.set(key, list)
  }
  return map
})

// ── 当前月 vs 历史月 ────────────────────────────────────────────
const isHistoricalMonth = computed(() => !isCurrentMonth(selectedMonth.value))
const monthLabelText = computed(() => monthLabel(selectedMonth.value))
const todayMonthLabel = computed(() => monthLabel(todayMonth.value))

/**
 * 老师目标：当前月用实时配置；历史月用当月快照（“当月当时的目标”），
 * 快照接口不可用（后端未部署）时兜底用当前配置并在页面提示。
 */
const effectiveTeachers = computed<TeacherConfig[]>(() => {
  if (!isHistoricalMonth.value || !monthSnapshot.value) return teachers.value
  return monthSnapshot.value.targets.map((item) => ({
    id: item.id,
    name: item.name,
    target: Number(item.monthlyTarget || 0),
    keywordsText: (item.aliases || []).join(','),
  }))
})

/** 出单来源运营者映射：历史月使用快照值，避免后续修改影响历史归因 */
const effectiveSourceOperators = computed(() => {
  if (!isHistoricalMonth.value || !monthSnapshot.value) return sourceOperators.value
  return monthSnapshot.value.sourceOperators || {}
})

const snapshotNote = computed(() => {
  if (snapshotFallback.value && isHistoricalMonth.value) {
    return '目标快照不可用 · 暂按当前配置显示'
  }
  if (!isHistoricalMonth.value || !monthSnapshot.value) return ''
  const time = monthSnapshot.value.capturedAt
    ? dayjs(monthSnapshot.value.capturedAt).format('YYYY-MM-DD HH:mm')
    : ''
  if (monthSnapshot.value.snapshotCreated) {
    return `目标快照首次生成于 ${time}（此前未保存该月配置）`
  }
  return time ? `目标快照：${time}` : ''
})

const validOrders = computed(() =>
  orders.value.filter((order) => order.isTransaction && !order.isRefunded),
)
const refundedOrders = computed(() => orders.value.filter((order) => order.isRefunded))
const totalOrderCount = computed(() => validOrders.value.length + refundedOrders.value.length)
const visibleOrders = validOrders
const totalCurrentOrders = computed(() => validOrders.value.length)
const totalRefundedOrders = computed(
  () => refundedOrders.value.length,
)
const totalTargetOrders = computed(() =>
  effectiveTeachers.value.reduce((sum, teacher) => sum + Number(teacher.target || 0), 0),
)
const totalRemainingOrders = computed(() =>
  Math.max(0, totalTargetOrders.value - totalCurrentOrders.value),
)
const totalProgress = computed(() => {
  if (totalTargetOrders.value <= 0) return 0
  return Math.min(100, Math.round((totalCurrentOrders.value / totalTargetOrders.value) * 100))
})
/** 历史月最终完成率：不封顶，展示真实结果 */
const finalCompletionRate = computed(() => {
  if (totalTargetOrders.value <= 0) return 0
  return Math.round((totalCurrentOrders.value / totalTargetOrders.value) * 100)
})
const isMonthGoalReached = computed(
  () => totalTargetOrders.value > 0 && totalCurrentOrders.value >= totalTargetOrders.value,
)
/** 当前月：从今天到月底的剩余天数；历史月：null（已结束，不再计算剩余日均） */
const daysRemaining = computed(() => daysRemainingForMonth(selectedMonth.value))
const dailyRequiredOrders = computed(() => {
  const days = daysRemaining.value
  if (days === null || days <= 0) return 0
  return Math.ceil(totalRemainingOrders.value / days)
})
const ladderRuleUpdatedText = computed(() => {
  if (!ladderConfigInitialized.value) return '规则尚未初始化到服务器'
  if (!ladderRuleUpdatedAt.value) return '规则尚未保存到服务器'
  const time = dayjs(ladderRuleUpdatedAt.value).format('YYYY-MM-DD HH:mm')
  return ladderRuleUpdatedBy.value ? `规则更新：${time} · ${ladderRuleUpdatedBy.value}` : `规则更新：${time}`
})
const activeChips = computed(() => {
  const chips = [
    '口径：按有效订单',
    '微信：有效订单',
    '抖店：有效订单',
  ]
  if (!showUnmatched.value) chips.push('仅看已匹配老师')
  if (selectedTeacher.value !== 'all') chips.push(`老师：${selectedTeacher.value}`)
  if (selectedPlatform.value !== 'all') chips.push(`平台：${selectedPlatform.value}`)
  return chips
})
const teacherRows = computed<TeacherRow[]>(() => {
  const rows = effectiveTeachers.value.map<TeacherRow>((teacher) => {
    const validOrderCount = validOrders.value.filter((order) => matchTeacher(order, teacher.name)).length
    const refundedOrderCount = orders.value.filter(
      (order) => order.isRefunded && matchTeacher(order, teacher.name),
    ).length
    const totalOrderCount = validOrderCount + refundedOrderCount
    const target = Number(teacher.target || 0)
    const completionRate = target > 0 ? Math.round((validOrderCount / target) * 100) : 0
    return {
      ...teacher,
      totalOrderCount,
      validOrderCount,
      refundedOrderCount,
      remaining: Math.max(0, target - validOrderCount),
      progress: Math.min(100, completionRate),
      completionRate,
    }
  })

  const matchedIds = new Set<string>()
  for (const teacher of effectiveTeachers.value) {
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
      totalOrderCount: unmatched.length,
      validOrderCount: unmatched.length,
      refundedOrderCount: 0,
      remaining: 0,
      progress: 0,
      completionRate: 0,
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
      totalOrderCount: 0,
      validOrderCount: 0,
      refundedOrderCount: 0,
    }
    if (order.isTransaction && !order.isRefunded) existing.validOrderCount += 1
    if (order.isRefunded) existing.refundedOrderCount += 1
    existing.totalOrderCount = existing.validOrderCount + existing.refundedOrderCount
    map.set(key, existing)
  }
  return Array.from(map.values()).sort(
    (a, b) => b.validOrderCount - a.validOrderCount || a.name.localeCompare(b.name),
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
      operator: '',
      operatorSource: null,
      accountId: '',
      orderIds: [],
      sourceAccountIds: new Set<string>(),
      totalOrderCount: 0,
      validOrderCount: 0,
      refundedOrderCount: 0,
    }
    existing.teacherNames.add(teacherName)
    existing.platformNames.add(order.platform)
    existing.sourceStoreNames.add(order.storeName)
    if (order.sourceAccountId) existing.sourceAccountIds.add(order.sourceAccountId)
    if (order.isTransaction && !order.isRefunded) existing.validOrderCount += 1
    existing.orderIds.push(order.id)
    if (order.isRefunded) existing.refundedOrderCount += 1
    existing.totalOrderCount = existing.validOrderCount + existing.refundedOrderCount
    map.set(key, existing)
  }
  const keyword = normalizeText(sourceSearch.value)
  return Array.from(map.values())
    .map((source) => {
      const teacherNames = Array.from(source.teacherNames)
      const platforms = Array.from(source.platformNames)
      const storeNames = Array.from(source.sourceStoreNames)
      const sourceAccountId = Array.from(source.sourceAccountIds).find(Boolean) || ''
      const resolved = resolveSourceOperator({
        sourceName: source.name,
        sourceKey: source.accountKey,
        sourceAccountId,
        platform: source.platform,
      })
      return {
        ...source,
        operator: resolved.operator,
        operatorSource: resolved.operatorSource,
        accountId: resolved.accountId,
        teacherName: compactLabel(teacherNames, '老师'),
        platform: platforms[0] || source.platform,
        platformLabel: compactLabel(platforms, '平台'),
        platforms,
        storeName: storeNames[0] || source.storeName,
        storeLabel: compactLabel(storeNames, '店'),
        storeNames,
      }
    })
    .filter((source) => source.totalOrderCount > 0)
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
    .sort((a, b) => b.validOrderCount - a.validOrderCount || a.teacherName.localeCompare(b.teacherName))
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
  const teacher = effectiveTeachers.value.find((item) => item.name === teacherName)
  if (!teacher) return false
  const haystack = normalizeText(order.teacherText)
  return teacherKeywords(teacher).some((keyword) => haystack.includes(keyword))
}

function teacherNameForOrder(order: LadderOrder) {
  return effectiveTeachers.value.find((teacher) => matchTeacher(order, teacher.name))?.name || '未匹配老师'
}

function normalizeText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·・_\-—｜|/\\()[\]（）【】,，.。:：;；]/g, '')
}

/**
 * 统一解析出单来源的运营者：
 * 1) 优先用订单/来源数据里的稳定账号 ID（微信 account_id / 抖店 author_id）精确关联「账号接入」；
 * 2) 匹配不到时，才用规范化昵称精确匹配（且要求唯一账号）；
 * 3) 历史手工 sourceOperators 仅作兜底，不再作为主要运营者数据源。
 */
function resolveSourceOperator(order: {
  sourceName: string
  sourceKey: string
  sourceAccountId: string
  platform: string
}): { operator: string; operatorSource: 'account' | 'legacy' | null; accountId: string } {
  const idKey = normalizeText(order.sourceAccountId)
  if (idKey) {
    const candidates = sourceAccountIdIndex.value.get(idKey) || []
    const preferredPlatform = order.platform === '微信小店' ? 'WECHAT_VIDEO' : 'DOUYIN'
    const account =
      candidates.find((item) => String(item.platform).toUpperCase() === preferredPlatform) ||
      candidates[0]
    if (account) {
      return {
        operator: account.primaryOperator?.user?.name || '',
        operatorSource: 'account',
        accountId: account.id,
      }
    }
  }

  const nameKey = normalizeText(order.sourceName)
  if (nameKey) {
    const byName = sourceAccountNameIndex.value.get(nameKey) || []
    const uniqueIds = new Set(byName.map((item) => item.id))
    if (uniqueIds.size === 1 && byName[0]) {
      return {
        operator: byName[0].primaryOperator?.user?.name || '',
        operatorSource: 'account',
        accountId: byName[0].id,
      }
    }
  }

  const legacyKey = nameKey || normalizeText(order.sourceKey) || order.sourceKey
  const legacyOperator = effectiveSourceOperators.value[legacyKey]
  if (legacyOperator) {
    return { operator: legacyOperator, operatorSource: 'legacy', accountId: '' }
  }

  return { operator: '', operatorSource: null, accountId: '' }
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

function readLegacySourceOperators() {
  try {
    const saved = window.localStorage.getItem(sourceOperatorStorageKey)
    const parsed = saved ? (JSON.parse(saved) as unknown) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {}
  } catch {
    return {}
  }
}

function openSourceDetail(source: SourceSummary) {
  selectedSourceKey.value = source.key
  showSourceDetail.value = true
}

function parseTeacherAliases(text?: string) {
  return String(text || '')
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function teacherFromDto(teacher: PerformanceLadderTeacherDto): TeacherConfig {
  return {
    id: teacher.id,
    name: teacher.name,
    target: Number(teacher.monthlyTarget || 0),
    keywordsText: (teacher.aliases || []).join(','),
  }
}

function readLegacyTeachers() {
  try {
    const saved = window.localStorage.getItem(teacherStorageKey.value)
    const parsed = saved ? (JSON.parse(saved) as unknown) : null
    const savedTeachers = Array.isArray(parsed) ? (parsed as TeacherConfig[]) : []
    return savedTeachers
      .filter((teacher) => teacher.name?.trim())
      .map((teacher) => ({
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
  } catch {
    return []
  }
}

function applyLadderConfig(data: PerformanceLadderConfigResponse) {
  ladderConfigInitialized.value = data.initialized
  excludeRefunded.value = true
  // 历史月视图的“显示未匹配”由该月快照决定，保存实时配置时不要重置它
  if (!isHistoricalMonth.value) showUnmatched.value = !data.config.hideUnmatched
  sourceOperators.value = data.config.sourceOperators || {}
  ladderRuleUpdatedAt.value = data.config.updatedAt || null
  ladderRuleUpdatedBy.value = data.config.updatedBy?.name || ''
  teachers.value = data.teachers.length
    ? data.teachers.filter((teacher) => teacher.enabled).map(teacherFromDto)
    : DEFAULT_TEACHERS.map((teacher) => ({ ...teacher }))
}

async function saveLadderConfig(payload: {
  monthlyTarget?: number
  refundMode?: string
  sourceIgnoreMode?: string
  hideUnmatched?: boolean
  sourceOperators?: Record<string, string>
  sourceIgnoreList?: string[]
}) {
  const res = await performanceLadderApi.updateConfig(payload)
  if (res.data) applyLadderConfig(res.data)
}

async function initializeServerConfigFromLegacyOrDefaults() {
  const legacyTeachers = readLegacyTeachers()
  const initialTeachers = legacyTeachers.length ? legacyTeachers : DEFAULT_TEACHERS
  const legacyOperators = readLegacySourceOperators()
  const res = await performanceLadderApi.initializeConfig({
    monthlyTarget: initialTeachers.reduce((sum, teacher) => sum + Number(teacher.target || 0), 0),
    refundMode: 'exclude',
    hideUnmatched: !showUnmatched.value,
    sourceOperators: legacyOperators,
    teachers: initialTeachers.map((teacher, index) => ({
      name: teacher.name,
      aliases: parseTeacherAliases(teacher.keywordsText),
      monthlyTarget: Number(teacher.target || 0),
      enabled: true,
      sortOrder: index,
    })),
  })
  window.localStorage.setItem(`performance-ladder-migrated:${dayjs().format('YYYY-MM')}`, '1')
  if (res.data) applyLadderConfig(res.data)
}

async function loadLadderConfig() {
  try {
    const res = await performanceLadderApi.getConfig()
    if (!res.data) return false
    if (!res.data.initialized) {
      await initializeServerConfigFromLegacyOrDefaults()
      return true
    }
    applyLadderConfig(res.data)
    return true
  } catch (error: any) {
    teachers.value = []
    sourceOperators.value = {}
    ElMessage.error(error?.message || '\u4e1a\u7ee9\u89c4\u5219\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u9875\u9762\u6216\u8054\u7cfb\u7ba1\u7406\u5458')
    return false
  }
}

async function saveTeachers() {
  const rows = teachers.value.filter((teacher) => teacher.name.trim())
  try {
    for (let index = 0; index < rows.length; index++) {
      const teacher = rows[index]
      const payload = {
        name: teacher.name.trim(),
        aliases: parseTeacherAliases(teacher.keywordsText),
        monthlyTarget: Number(teacher.target || 0),
        enabled: true,
        sortOrder: index,
      }
      const replaceLocal = (dto: PerformanceLadderTeacherDto | undefined) => {
        if (!dto) return
        const idx = teachers.value.findIndex((item) => item.id === teacher.id)
        if (idx >= 0) teachers.value[idx] = teacherFromDto(dto)
      }
      // 本地默认/历史 id 不是服务器 id：直接新建，避免向服务器提交失效引用
      if (!String(teacher.id || '').startsWith('pltea_')) {
        const created = await performanceLadderApi.createTeacher(payload)
        replaceLocal(created.data?.teacher)
        continue
      }
      try {
        const updated = await performanceLadderApi.updateTeacher(teacher.id, payload)
        replaceLocal(updated.data?.teacher)
      } catch (error: any) {
        if (isTeacherMissingError(error)) {
          // 老师在服务器上已被删除（失效引用）：按当前配置重建，并换用新服务器 id
          const created = await performanceLadderApi.createTeacher(payload)
          replaceLocal(created.data?.teacher)
        } else {
          throw error
        }
      }
    }
    const fresh = await performanceLadderApi.getConfig()
    if (fresh.data) applyLadderConfig(fresh.data)
    ElMessage.success('老师配置已保存')
  } catch (error: any) {
    ElMessage.error('老师配置保存失败，请稍后重试')
  }
}

let addingTeacher = false

async function addTeacher() {
  if (addingTeacher) return
  addingTeacher = true
  try {
    const res = await performanceLadderApi.createTeacher({
      name: '新老师',
      aliases: [],
      monthlyTarget: 1600,
      enabled: true,
      sortOrder: teachers.value.length,
    })
    if (res.data?.teacher) teachers.value.push(teacherFromDto(res.data.teacher))
  } catch (error: any) {
    ElMessage.error(error?.message || '老师添加失败，请稍后重试')
  } finally {
    addingTeacher = false
  }
}

function isTeacherMissingError(error: any) {
  return error?.response?.status === 404
}

async function removeTeacher(id: string) {
  const index = teachers.value.findIndex((teacher) => teacher.id === id)
  if (index < 0) return
  const removed = teachers.value[index]
  // 先本地移除，防止重复点击/多标签页对同一个 id 重复提交删除请求
  teachers.value = teachers.value.filter((teacher) => teacher.id !== id)
  try {
    await performanceLadderApi.deleteTeacher(id)
  } catch (error: any) {
    if (isTeacherMissingError(error)) {
      // 服务器上已不存在（已被删除的失效引用）：本地同步移除即可，不再报错
      return
    }
    teachers.value.splice(index, 0, removed)
    ElMessage.error('老师删除失败，请稍后重试')
  }
}

async function toggleUnmatched() {
  showUnmatched.value = !showUnmatched.value
  // 历史月只切换本地显示，不写服务器配置（避免污染当前月规则）
  if (isHistoricalMonth.value) return
  try {
    await saveLadderConfig({ hideUnmatched: !showUnmatched.value })
  } catch {
    showUnmatched.value = !showUnmatched.value
  }
}

function teacherStatusText(teacher: TeacherRow) {
  if (teacher.locked) return '待整理归因'
  if (isHistoricalMonth.value) {
    return teacher.completionRate >= 100 ? '当月已达标' : '当月未达标'
  }
  if (teacher.progress >= 100) return '目标已完成'
  if (teacher.progress >= 70) return '冲刺状态良好'
  if (teacher.progress >= 35) return '稳步推进中'
  return '需要重点补量'
}

function teacherTagType(teacher: TeacherRow) {
  if (isHistoricalMonth.value) {
    return teacher.completionRate >= 100 ? 'success' : 'danger'
  }
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

function wechatSourceAccountId(order: WechatOrder) {
  return primaryWechatSource(order)?.account_id || ''
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
    // 售后只设 begin（该月首至今）：跨月退款（8月订单9月才退）也必须识别，
    // 否则历史月有效订单会高估。多余售后记录无害（只按本月订单 id 匹配）
    wechatStoreApi.getAftersaleCount?.(store.id, {
      begin_create_time: start,
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
    sourceAccountId: wechatSourceAccountId(order),
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
    // 同微信：只设 begin，覆盖跨月退款；多余售后记录无害
    doudianStoreApi.getAftersales(store.id, {
      begin_create_time: start,
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
    sourceAccountId: order.author_id || '',
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

async function loadSourceAccounts() {
  try {
    const all: Account[] = []
    const pageSize = 100
    const first = await accountsApi.getList({
      platform: '',
      group: '',
      keyword: '',
      page: 1,
      pageSize,
    })
    const firstList = first.data as any
    const firstAccounts = Array.isArray(firstList?.accounts)
      ? firstList.accounts
      : Array.isArray(firstList?.items)
        ? firstList.items
        : []
    const total = Number(firstList?.total) || firstAccounts.length
    all.push(...firstAccounts)
    let page = 2
    while (all.length < total && page <= 50) {
      const res = await accountsApi.getList({
        platform: '',
        group: '',
        keyword: '',
        page,
        pageSize,
      })
      const pageData = res.data as any
      const list = Array.isArray(pageData?.accounts)
        ? pageData.accounts
        : Array.isArray(pageData?.items)
          ? pageData.items
          : []
      if (!list.length) break
      all.push(...list)
      page += 1
    }
    sourceAccounts.value = all
  } catch {
    sourceAccounts.value = []
  }
}

/** 拉取历史月的目标/规则快照（不直接写状态，由调用方在守卫校验后应用） */
async function fetchMonthSnapshot(month: string) {
  try {
    const res = await performanceLadderApi.getMonthSnapshot(month)
    if (!res.data) throw new Error('snapshot empty')
    return { data: res.data, fallback: false }
  } catch {
    // 后端尚未部署快照接口（404 等）时兜底：沿用当前配置，页面有明确提示
    return { data: null, fallback: true }
  }
}

async function loadMonthData() {
  const month = selectedMonth.value
  const seq = orderLoadGuard.begin()
  loading.value = true
  monthError.value = ''
  const loadingStore = useLoadingStore()
  loadingStore.start()
  try {
    // 历史月：读取该月当时生效的目标/规则；当前月：直接用实时配置
    if (!isCurrentMonth(month)) {
      const { data: snapshot, fallback } = await fetchMonthSnapshot(month)
      if (!orderLoadGuard.isLatest(seq)) return
      monthSnapshot.value = snapshot
      snapshotFallback.value = fallback
      if (snapshot && !snapshot.isCurrentMonth) {
        showUnmatched.value = !snapshot.hideUnmatched
      }
      if (fallback) {
        ElMessage.warning(`${monthLabel(month)}目标快照不可用，暂时按当前目标计算`)
      }
    } else {
      monthSnapshot.value = null
      snapshotFallback.value = false
    }

    const { start, end } = monthRange(month)
    const [wechatStoresRes, doudianStoresRes] = await Promise.all([
      wechatStoreApi.getStores(),
      doudianStoreApi.getStores(),
      loadSourceAccounts(),
    ])
    if (!orderLoadGuard.isLatest(seq)) return
    const wechatStores = Array.isArray(wechatStoresRes.data) ? wechatStoresRes.data : []
    const doudianStores = Array.isArray(doudianStoresRes.data) ? doudianStoresRes.data : []
    const results = await Promise.allSettled([
      ...wechatStores.map((store) => loadWechatStoreOrders(store, start, end)),
      ...doudianStores.map((store) => loadDoudianStoreOrders(store, start, end)),
    ])
    // 防串月：期间用户又切换了月份，丢弃本次过期结果
    if (!orderLoadGuard.isLatest(seq)) return
    orders.value = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    const failed = results.filter((result) => result.status === 'rejected').length
    if (failed > 0) ElMessage.warning(`${failed} 家店铺订单读取失败，其余店铺已汇总`)
  } catch (error: any) {
    if (!orderLoadGuard.isLatest(seq)) return
    // 加载失败：保留旧数据、给出明确错误提示，绝不显示 0
    monthError.value = `${monthLabel(month)}数据加载失败`
    ElMessage.error(error?.message || monthError.value)
  } finally {
    // loadingStore 是引用计数，每次 start 必须配对一次 stop；
    // 被守卫丢弃的旧请求也要归还计数，否则快速切月会泄漏计数导致全局刷新动画卡住
    loadingStore.stop()
    if (orderLoadGuard.isLatest(seq)) loading.value = false
  }
}

/** 把当前月份同步到 URL：?month=YYYY-MM，当前自然月时不带参数 */
function syncMonthToUrl() {
  const query: LocationQueryRaw = { ...route.query }
  if (selectedMonth.value === todayMonth.value) delete query.month
  else query.month = selectedMonth.value
  const before = typeof route.query.month === 'string' ? route.query.month : undefined
  const after = typeof query.month === 'string' ? query.month : undefined
  if (before !== after) void router.replace({ query })
}

function handleMonthChange(next: string) {
  if (next === selectedMonth.value) return
  // 双保险：任何入口都不能切到未来月份
  selectedMonth.value = next > todayMonth.value ? todayMonth.value : next
}

watch(selectedMonth, () => {
  syncMonthToUrl()
  void loadMonthData()
})

onMounted(async () => {
  const configReady = await loadLadderConfig()
  if (configReady) {
    syncMonthToUrl()
    void loadMonthData()
  }
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
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: $space-2;
    min-width: 0;

    // 小屏：月份切换器 + 快照提示自动换行，不挤压标题与操作按钮
    @media (max-width: 640px) {
      gap: $space-1;
    }
  }

  &__eyebrow-divider {
    color: $accent-300;
    font-weight: 700;
  }

  &__eyebrow-text {
    color: $accent-300;
    font-size: $text-xs;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  &__snapshot-note {
    max-width: 100%;
    overflow: hidden;
    color: $text-tertiary;
    font-size: $text-micro;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__month-error {
    position: relative;
    z-index: 1;
    margin-top: $space-4;
  }

  &__goal-tag {
    align-self: center;
    margin-left: $space-2;
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

  &__rule-updated {
    color: $text-secondary;
    font-size: $text-xs;
    white-space: nowrap;
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

  &__reached {
    color: $color-success !important;
    font-weight: 700;
  }

  &__missed {
    color: $color-danger !important;
    font-weight: 700;
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

// 响应式基准是主内容区域的实际可用宽度（container query），
// 而不是 viewport：左侧导航会占用空间，viewport 断点会失准。
.source-board {
  container-type: inline-size;
  padding: $space-5;
  min-height: 240px;
}

.podium {
  display: grid;
  grid-template-columns: 1.24fr 1fr 1fr;
  gap: $space-4;
  margin-bottom: $space-4;

  // 中：Top3 两列
  @container (max-width: 940px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  // 窄：Top3 单列
  @container (max-width: 560px) {
    grid-template-columns: 1fr;
  }
}

.podium-card {
  position: relative;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  min-width: 0;
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
    max-width: 100%;
    margin: 0;
    overflow: hidden;
    color: $text-tertiary;
    font-size: $text-xs;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__operator {
    margin-top: $space-1 !important;
    color: $accent-200 !important;
  }

  // 数字块不再绝对定位：改为 flex 流内布局，宽屏靠右对齐、
  // 窄卡片自动堆到信息下方，绝不与运营者/总订单/退款文字重叠。
  &__orders {
    display: grid;
    justify-items: end;
    gap: 2px;
    margin-top: auto;
    padding-top: $space-3;
    font-family: $font-mono;

    strong {
      color: $text-primary;
      font-size: clamp(26px, 5.5cqw, 38px);
      line-height: 1;
    }

    span,
    em {
      color: $text-tertiary;
      font-size: $text-micro;
      font-style: normal;
      white-space: nowrap;
    }

    em {
      color: $color-danger;
    }
  }

  // 卡片内部响应式：空间不足时数字与标签改为上下结构、左对齐
  @container (max-width: 330px) {
    &__orders {
      justify-items: start;
    }
  }
}

.source-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: $space-3;

  // 窄：普通排行单列
  @container (max-width: 940px) {
    grid-template-columns: 1fr;
  }
}

.source-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: $space-3;
  min-width: 0;
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

    span {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__stats {
    display: grid;
    justify-items: end;
    gap: 2px;
    font-family: $font-mono;
    white-space: nowrap;

    strong {
      color: $text-primary;
      font-size: clamp(18px, 3cqw, 22px);
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

  &__month-hint {
    margin: 0;
  }

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
      align-items: center;
    }

    .source-detail__operator-value {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: $space-2;
    }

    .source-detail__operator-hint {
      flex-basis: 100%;
      margin: 0;
      color: $text-tertiary;
      font-size: $text-xs;
      line-height: 1.6;
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

.operator-origin {
  margin-left: $space-1;
  padding: 0 5px;
  border: 1px solid rgba($accent-400, 0.45);
  border-radius: 4px;
  color: $accent-200;
  font-size: 11px;
  font-style: normal;
  line-height: 1.6;
  vertical-align: 1px;
}
</style>
