<template>
  <div class="system-health">
    <div class="sh-header">
      <div>
        <h2>披星云系统健康中心</h2>
        <p>统一查看网站、后端、数据库、伴侣、业务和发布健康状态</p>
      </div>
      <el-button :loading="loading" @click="refreshAll">刷新</el-button>
    </div>

    <el-card
      shadow="never"
      class="sh-hero"
      :class="`sh-hero--${overview?.overallStatus || 'UNKNOWN'}`"
    >
      <div class="sh-hero__status">{{ statusLabel(overview?.overallStatus) }}</div>
      <div class="sh-hero__meta">
        <span>生成时间：{{ fmtTime(overview?.generatedAt) }}</span>
        <span>后端：{{ overview?.runtime.backendVersion || '-' }}</span>
        <span>内存：{{ overview?.runtime.memoryMb ?? '-' }}MB</span>
      </div>
    </el-card>

    <el-row :gutter="12" class="sh-cards">
      <el-col v-for="card in healthCards" :key="card.key" :xs="24" :sm="12" :lg="4">
        <div class="sh-card">
          <div class="sh-card__name">{{ card.name }}</div>
          <div class="sh-card__status" :class="`is-${card.status}`">
            {{ statusLabel(card.status) }}
          </div>
          <div class="sh-card__desc">{{ card.desc }}</div>
        </div>
      </el-col>
    </el-row>

    <el-card shadow="never" class="sh-section">
      <template #header>
        <div class="sh-section__head">
          <span>需要我处理</span>
          <el-tag type="danger" effect="dark">P0 {{ overview?.counters.p0 || 0 }}</el-tag>
          <el-tag type="warning" effect="dark">P1 {{ overview?.counters.p1 || 0 }}</el-tag>
        </div>
      </template>
      <el-table :data="overview?.actionItems || []" size="small" empty-text="暂无 P0/P1 处理项">
        <el-table-column label="级别" width="90">
          <template #default="{ row }">
            <el-tag :type="severityType(row.severity)" size="small">{{ row.severity }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sourceType" label="来源" width="110" />
        <el-table-column prop="title" label="问题" min-width="180" />
        <el-table-column prop="summary" label="摘要" min-width="220" show-overflow-tooltip />
        <el-table-column label="次数" width="80">
          <template #default="{ row }">{{ row.occurrenceCount }}</template>
        </el-table-column>
        <el-table-column label="最近发生" width="170">
          <template #default="{ row }">{{ fmtTime(row.lastOccurredAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-tabs v-model="activeTab" class="sh-tabs">
      <el-tab-pane label="故障中心" name="incidents">
        <el-card shadow="never">
          <template #header>
            <div class="sh-section__head">
              <span>统一故障</span>
              <el-button size="small" @click="loadIncidents">刷新</el-button>
            </div>
          </template>
          <el-table :data="incidents" size="small" empty-text="暂无故障记录">
            <el-table-column prop="status" label="状态" width="110" />
            <el-table-column label="级别" width="90">
              <template #default="{ row }"
                ><el-tag :type="severityType(row.severity)" size="small">{{
                  row.severity
                }}</el-tag></template
              >
            </el-table-column>
            <el-table-column prop="sourceType" label="来源" width="110" />
            <el-table-column prop="title" label="标题" min-width="180" />
            <el-table-column prop="summary" label="摘要" min-width="220" show-overflow-tooltip />
            <el-table-column label="确认" width="110">
              <template #default="{ row }">
                <el-button v-if="!row.acknowledgedAt" size="small" @click="ackIncident(row.id)"
                  >我看过了</el-button
                >
                <span v-else class="sh-muted">已确认</span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="事件流" name="events">
        <el-card shadow="never">
          <template #header>
            <div class="sh-section__head">
              <span>最近事件</span>
              <el-button size="small" @click="loadEvents">刷新</el-button>
            </div>
          </template>
          <el-table :data="events" size="small" empty-text="暂无事件">
            <el-table-column label="时间" width="170">
              <template #default="{ row }">{{ fmtTime(row.occurredAt) }}</template>
            </el-table-column>
            <el-table-column prop="sourceType" label="来源" width="110" />
            <el-table-column prop="eventType" label="类型" width="140" />
            <el-table-column prop="message" label="内容" min-width="260" show-overflow-tooltip />
            <el-table-column
              prop="requestId"
              label="Request ID"
              width="180"
              show-overflow-tooltip
            />
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="伴侣监控" name="companion">
        <CompanionMonitorView />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import CompanionMonitorView from './CompanionMonitorView.vue'
import {
  acknowledgeSystemIncident,
  fetchSystemEvents,
  fetchSystemHealthOverview,
  fetchSystemIncidents,
  type SystemEvent,
  type SystemHealthOverview,
  type SystemHealthStatus,
  type SystemIncident,
} from '@/api/system-health'

const loading = ref(false)
const activeTab = ref('incidents')
const overview = ref<SystemHealthOverview | null>(null)
const incidents = ref<SystemIncident[]>([])
const events = ref<SystemEvent[]>([])

const healthCards = computed(() => {
  const cards = overview.value?.cards
  return [
    {
      key: 'frontend',
      name: '前端网站',
      status: cards?.frontend.status,
      desc: `当前故障 ${cards?.frontend.activeIncidents ?? 0} · 24h 错误 ${cards?.frontend.errors24h ?? 0}`,
    },
    {
      key: 'backend',
      name: '后端 API',
      status: cards?.backend.status,
      desc: `当前故障 ${cards?.backend.activeIncidents ?? 0} · 500 ${cards?.backend.errors24h ?? 0} · 慢接口 ${cards?.backend.slowApis24h ?? 0}`,
    },
    {
      key: 'database',
      name: '数据库',
      status: cards?.database.status,
      desc: cards?.database.responseTimeMs ? `${cards.database.responseTimeMs}ms` : 'SELECT 1',
    },
    {
      key: 'companion',
      name: '伴侣',
      status: cards?.companion.status,
      desc: `离线 ${cards?.companion.offline ?? 0} · 受影响 ${cards?.companion.anomalies ?? 0} · 未恢复故障 ${cards?.companion.activeIncidents ?? 0}`,
    },
    {
      key: 'business',
      name: '业务数据',
      status: cards?.business.status,
      desc: cards?.business.note || '待接入',
    },
    {
      key: 'release',
      name: '发布版本',
      status: cards?.release.status,
      desc: cards?.release.note || '待接入',
    },
  ] as Array<{ key: string; name: string; status?: SystemHealthStatus; desc: string }>
})

async function refreshAll() {
  loading.value = true
  try {
    await Promise.all([loadOverview(), loadIncidents(), loadEvents()])
  } finally {
    loading.value = false
  }
}

async function loadOverview() {
  const res = await fetchSystemHealthOverview()
  overview.value = res.data
}

async function loadIncidents() {
  const res = await fetchSystemIncidents({ status: 'all', take: 200 })
  incidents.value = res.data || []
}

async function loadEvents() {
  const res = await fetchSystemEvents({ take: 200 })
  events.value = res.data || []
}

async function ackIncident(id: string) {
  await acknowledgeSystemIncident(id)
  ElMessage.success('已确认，不会改变恢复状态')
  await loadIncidents()
}

function statusLabel(status?: string) {
  const map: Record<string, string> = {
    HEALTHY: '健康',
    DEGRADED: '降级',
    INCIDENT: '故障中',
    CRITICAL: '严重故障',
    UNKNOWN: '未接入',
  }
  return map[status || 'UNKNOWN'] || status || '未接入'
}

function severityType(severity: string): 'success' | 'warning' | 'danger' | 'info' {
  if (severity === 'CRITICAL' || severity === 'ERROR') return 'danger'
  if (severity === 'WARNING') return 'warning'
  return 'info'
}

function fmtTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', { hour12: false })
}

onMounted(() => {
  refreshAll().catch(() => undefined)
})
</script>

<style scoped>
.system-health {
  padding: 16px 20px;
}
.sh-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 14px;
}
.sh-header h2 {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
}
.sh-header p {
  margin: 0;
  color: #8a8f99;
  font-size: 13px;
}
.sh-hero {
  margin-bottom: 12px;
  border-radius: 12px;
}
.sh-hero__status {
  font-size: 28px;
  font-weight: 800;
}
.sh-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: #8a8f99;
  margin-top: 6px;
  font-size: 12px;
}
.sh-hero--HEALTHY {
  border-color: rgba(52, 199, 89, 0.45);
}
.sh-hero--DEGRADED {
  border-color: rgba(230, 162, 60, 0.55);
}
.sh-hero--INCIDENT,
.sh-hero--CRITICAL {
  border-color: rgba(224, 80, 80, 0.65);
}
.sh-cards {
  margin-bottom: 12px;
}
.sh-cards .el-col {
  margin-bottom: 12px;
}
.sh-card {
  min-height: 92px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  padding: 14px;
  background: var(--el-bg-color);
}
.sh-card__name {
  color: #8a8f99;
  font-size: 12px;
}
.sh-card__status {
  margin: 8px 0;
  font-size: 20px;
  font-weight: 800;
}
.sh-card__status.is-HEALTHY {
  color: #34c759;
}
.sh-card__status.is-DEGRADED {
  color: #e6a23c;
}
.sh-card__status.is-INCIDENT,
.sh-card__status.is-CRITICAL {
  color: #e05050;
}
.sh-card__status.is-UNKNOWN {
  color: #8a8f99;
}
.sh-card__desc {
  color: #8a8f99;
  font-size: 12px;
}
.sh-section {
  margin-bottom: 12px;
}
.sh-section__head {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}
.sh-tabs {
  margin-top: 12px;
}
.sh-muted {
  color: #8a8f99;
}
</style>
