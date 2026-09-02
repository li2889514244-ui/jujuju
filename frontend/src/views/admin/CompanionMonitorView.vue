<template>
  <div class="companion-monitor">
    <!-- 页头 -->
    <div class="cm-header">
      <div class="cm-header__title">
        <h2>伴侣监控中心</h2>
        <p>已安装伴侣设备的运行状态总览（仅展示伴侣自身进程与任务状态）</p>
      </div>
      <div class="cm-header__actions">
        <span v-if="lastRefreshAt" class="cm-refresh-at">更新于 {{ lastRefreshAt }}</span>
        <el-button :loading="loading" @click="refreshAll">
          <el-icon><Refresh /></el-icon>
          <span>刷新</span>
        </el-button>
      </div>
    </div>

    <!-- 健康总览 -->
    <el-row :gutter="12" class="cm-overview">
      <el-col :span="4"><div class="cm-card"><div class="cm-card__num">{{ overview.deviceTotal }}</div><div class="cm-card__label">设备总数</div></div></el-col>
      <el-col :span="4"><div class="cm-card cm-card--ok"><div class="cm-card__num">{{ overview.counts.normal }}</div><div class="cm-card__label">正常</div></div></el-col>
      <el-col :span="4"><div class="cm-card cm-card--warn"><div class="cm-card__num">{{ overview.counts.abnormal }}</div><div class="cm-card__label">异常</div></div></el-col>
      <el-col :span="4"><div class="cm-card cm-card--off"><div class="cm-card__num">{{ overview.counts.offline }}</div><div class="cm-card__label">离线</div></div></el-col>
      <el-col :span="4"><div class="cm-card cm-card--old"><div class="cm-card__num">{{ overview.counts.versionOutdated }}</div><div class="cm-card__label">版本过旧</div></div></el-col>
      <el-col :span="4"><div class="cm-card"><div class="cm-card__num">{{ rateText(overview.todayCollectionRate) }}</div><div class="cm-card__label">今日采集成功率</div></div></el-col>
      <el-col :span="4"><div class="cm-card"><div class="cm-card__num">{{ rateText(overview.todaySyncRate) }}</div><div class="cm-card__label">今日同步成功率</div></div></el-col>
      <el-col :span="4"><div class="cm-card"><div class="cm-card__num cm-card__num--sm">{{ overview.latestVersion || '-' }}</div><div class="cm-card__label">最新伴侣版本</div></div></el-col>
    </el-row>

    <!-- 告警 -->
    <el-card v-if="alerts.length" shadow="never" class="cm-alerts">
      <template #header>
        <div class="cm-alerts__head">
          <span>未处理告警（{{ alerts.length }}）</span>
          <el-button size="small" @click="loadAlerts">刷新</el-button>
        </div>
      </template>
      <div v-for="alert in alerts" :key="alert.id" class="cm-alert-item">
        <el-tag :type="alertType(alert.type)" size="small">{{ alertTypeLabel(alert.type) }}</el-tag>
        <span class="cm-alert-item__msg">{{ alert.message }}</span>
        <span v-if="alert.deviceId" class="cm-alert-item__dev">{{ deviceNameOf(alert.deviceId) }}</span>
        <span class="cm-alert-item__time">{{ fmtTime(alert.createdAt) }}</span>
        <el-button size="small" @click="ackAlert(alert)">知道了</el-button>
      </div>
    </el-card>

    <!-- 设备列表 -->
    <el-card shadow="never" class="cm-devices">
      <template #header>
        <div class="cm-devices__head">
          <span>设备列表（{{ devices.length }}）</span>
          <el-radio-group v-model="filter" size="small" @change="loadDevices">
            <el-radio-button value="">全部</el-radio-button>
            <el-radio-button value="online">在线</el-radio-button>
            <el-radio-button value="offline">离线</el-radio-button>
            <el-radio-button value="abnormal">异常</el-radio-button>
            <el-radio-button value="version_outdated">版本过旧</el-radio-button>
            <el-radio-button value="collecting">正在采集</el-radio-button>
            <el-radio-button value="syncing">正在同步</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <el-table :data="devices" stripe size="small" empty-text="暂无设备上报">
        <el-table-column label="设备" min-width="150">
          <template #default="{ row }">
            <div class="cm-cell-name">{{ row.deviceName || '未命名设备' }}</div>
            <div class="cm-cell-sub">{{ row.deviceId }}</div>
          </template>
        </el-table-column>
        <el-table-column label="使用人" width="110">
          <template #default="{ row }">{{ row.ownerName || '-' }}</template>
        </el-table-column>
        <el-table-column label="版本" width="90">
          <template #default="{ row }">
            <el-tag :type="row.companionVersion === overview.latestVersion ? 'success' : 'warning'" size="small">{{ row.companionVersion || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="在线状态" width="100">
          <template #default="{ row }">
            <el-tag :type="healthTagType(row.healthStatus)" size="small">{{ healthLabel(row.healthStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前任务" width="130">
          <template #default="{ row }">
            <el-tag v-if="row.currentTask && row.currentTask !== 'idle'" :type="taskTagType(row.currentTask)" size="small">{{ taskLabel(row.currentTask) }}</el-tag>
            <span v-else class="cm-muted">空闲</span>
            <div v-if="taskDetailText(row)" class="cm-cell-sub">{{ taskDetailText(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="平台状态" min-width="160">
          <template #default="{ row }">
            <div v-if="platformTags(row).length" class="cm-platforms">
              <span v-for="(p, idx) in platformTags(row)" :key="idx" class="cm-platform" :class="'cm-platform--' + p.cls">
                {{ p.label }}
              </span>
            </div>
            <span v-else class="cm-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="最后采集" width="130">
          <template #default="{ row }">
            <div v-if="row.lastCollectionAt">{{ timeAgo(row.lastCollectionAt) }}</div>
            <span v-else class="cm-muted">-</span>
            <div class="cm-cell-sub" v-if="row.lastCollectionAt">
              <span :class="row.lastCollectionSuccess ? 'cm-ok' : 'cm-bad'">
                {{ row.lastCollectionSuccess ? '成功' : '失败' }}
              </span>
              <span v-if="row.lastCollectionAccountCount">· {{ row.lastCollectionAccountCount }} 账号</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="最后同步" width="130">
          <template #default="{ row }">
            <div v-if="row.lastSyncAt">{{ timeAgo(row.lastSyncAt) }}</div>
            <span v-else class="cm-muted">-</span>
            <div class="cm-cell-sub" v-if="row.lastSyncAt">
              <span :class="row.lastSyncSuccess ? 'cm-ok' : 'cm-bad'">{{ row.lastSyncSuccess ? '成功' : '失败' }}</span>
              <span v-if="row.lastSyncUploadCount">· 上传 {{ row.lastSyncUploadCount }}</span>
              <span v-if="row.lastSyncErrorCode" class="cm-bad">· {{ row.lastSyncErrorCode }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="最近异常" min-width="160">
          <template #default="{ row }">
            <template v-if="row.lastErrorMessage">
              <div class="cm-bad">{{ row.lastErrorCode || 'ERROR' }}</div>
              <el-tooltip :content="row.lastErrorMessage" placement="top">
                <div class="cm-cell-sub cm-ellipsis">{{ row.lastErrorMessage }}</div>
              </el-tooltip>
              <div class="cm-cell-sub">{{ fmtTime(row.lastErrorAt) }}</div>
            </template>
            <span v-else class="cm-muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="资源" width="110">
          <template #default="{ row }">
            <div class="cm-cell-sub" v-if="row.cpuPercent !== null">CPU {{ row.cpuPercent }}%</div>
            <div class="cm-cell-sub" v-if="row.memoryMb !== null">内存 {{ row.memoryMb }}MB</div>
            <div class="cm-cell-sub" v-if="row.processUptimeSeconds">运行 {{ uptimeText(row.processUptimeSeconds) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="最后心跳" width="110">
          <template #default="{ row }">{{ row.lastHeartbeatAt ? timeAgo(row.lastHeartbeatAt) : '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openHistory(row)">历史</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 历史弹窗 -->
    <el-dialog v-model="historyVisible" :title="historyTitle" width="860px" top="6vh">
      <div class="cm-history-toolbar">
        <el-radio-group v-model="historyDays" size="small" @change="loadHistory">
          <el-radio-button :value="7">近7天</el-radio-button>
          <el-radio-button :value="30">近30天</el-radio-button>
        </el-radio-group>
        <span class="cm-muted">共 {{ historyHeartbeats.length }} 条心跳记录</span>
      </div>
      <el-table :data="historyHeartbeats" size="small" max-height="380">
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ fmtTime(row.receivedAt) }}</template>
        </el-table-column>
        <el-table-column label="任务" width="100">
          <template #default="{ row }">{{ row.taskStatus || 'idle' }}</template>
        </el-table-column>
        <el-table-column label="版本" width="90">
          <template #default="{ row }">{{ row.companionVersion }}</template>
        </el-table-column>
        <el-table-column label="采集" width="90">
          <template #default="{ row }">{{ collectionBrief(row.lastCollection) }}</template>
        </el-table-column>
        <el-table-column label="同步" width="110">
          <template #default="{ row }">{{ syncBrief(row.lastSync) }}</template>
        </el-table-column>
        <el-table-column label="错误" min-width="140">
          <template #default="{ row }">{{ errorBrief(row.lastError) }}</template>
        </el-table-column>
        <el-table-column label="CPU" width="70">
          <template #default="{ row }">{{ row.cpuPercent !== null ? row.cpuPercent + '%' : '-' }}</template>
        </el-table-column>
        <el-table-column label="内存MB" width="80">
          <template #default="{ row }">{{ row.memoryMb !== null ? row.memoryMb : '-' }}</template>
        </el-table-column>
      </el-table>
      <el-divider content-position="left">设备告警</el-divider>
      <el-table :data="historyAlerts" size="small" max-height="220" empty-text="该时间段内无告警">
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="类型" width="160">
          <template #default="{ row }">
            <el-tag :type="alertType(row.type)" size="small">{{ alertTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="内容" min-width="200">
          <template #default="{ row }">{{ row.message }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import {
  fetchCompanionDevices,
  fetchCompanionOverview,
  fetchCompanionAlerts,
  acknowledgeCompanionAlert,
  fetchCompanionDeviceHistory,
} from '@/api/companion-monitor'
import type { CompanionDevice, CompanionAlert } from '@/api/companion-monitor'

const loading = ref(false)
const filter = ref('')
const devices = ref<CompanionDevice[]>([])
const alerts = ref<CompanionAlert[]>([])
const overview = ref({
  counts: { normal: 0, abnormal: 0, offline: 0, versionOutdated: 0 },
  todayCollectionRate: null as number | null,
  todaySyncRate: null as number | null,
  deviceTotal: 0,
  latestVersion: '',
})
const lastRefreshAt = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

const historyVisible = ref(false)
const historyDays = ref(7)
const historyDevice = ref<CompanionDevice | null>(null)
const historyHeartbeats = ref<any[]>([])
const historyAlerts = ref<any[]>([])
const historyTitle = ref('设备历史')

async function loadDevices() {
  const res = await fetchCompanionDevices(filter.value || undefined)
  devices.value = res.data?.devices || []
}

async function loadOverview() {
  const res = await fetchCompanionOverview()
  if (res.data) overview.value = res.data
}

async function loadAlerts() {
  const res = await fetchCompanionAlerts('open')
  alerts.value = res.data || []
}

async function refreshAll() {
  loading.value = true
  try {
    await Promise.all([loadDevices(), loadOverview(), loadAlerts()])
    lastRefreshAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } finally {
    loading.value = false
  }
}

async function ackAlert(alert: CompanionAlert) {
  await acknowledgeCompanionAlert(alert.id)
  ElMessage.success('已确认该告警')
  await loadAlerts()
}

async function openHistory(row: CompanionDevice) {
  historyDevice.value = row
  historyVisible.value = true
  historyTitle.value = (row.deviceName || '设备') + ' · 历史'
  await loadHistory()
}

async function loadHistory() {
  if (!historyDevice.value) return
  const res = await fetchCompanionDeviceHistory(historyDevice.value.deviceId, historyDays.value)
  historyHeartbeats.value = res.data?.heartbeats || []
  historyAlerts.value = res.data?.alerts || []
}

// ── 展示辅助 ──

function fmtTime(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('zh-CN', { hour12: false })
}

function timeAgo(value: string): string {
  const d = new Date(value).getTime()
  if (Number.isNaN(d)) return '-'
  const diff = Math.floor((Date.now() - d) / 1000)
  if (diff < 60) return diff + '秒前'
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前'
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前'
  return Math.floor(diff / 86400) + '天前'
}

function uptimeText(seconds: number): string {
  if (!seconds) return '-'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return d + '天' + h + '时'
  if (h > 0) return h + '时' + m + '分'
  return m + '分'
}

function rateText(value: number | null): string {
  return value === null || value === undefined ? '-' : value + '%'
}

function healthLabel(status: string): string {
  const map: Record<string, string> = { online: '在线', unstable: '连接不稳定', offline: '离线', unknown: '未知' }
  return map[status] || status
}

function healthTagType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'online') return 'success'
  if (status === 'unstable') return 'warning'
  if (status === 'offline') return 'danger'
  return 'info'
}

function taskLabel(task: string): string {
  const map: Record<string, string> = {
    idle: '空闲', collecting: '采集中', syncing: '同步中', uploading: '上传中',
    queued: '排队中', updating: '更新中', error: '任务异常',
  }
  return map[task] || task
}

function taskTagType(task: string): 'success' | 'warning' | 'danger' | 'info' {
  if (task === 'error') return 'danger'
  if (task === 'updating') return 'warning'
  if (task === 'collecting') return 'success'
  if (task === 'syncing' || task === 'uploading') return 'info'
  return 'info'
}

function taskDetailText(row: CompanionDevice): string {
  const detail = row.currentTaskDetail as Record<string, any> | null
  if (!detail) return ''
  if (detail.nickname) return detail.nickname
  if (detail.storeName) return detail.storeName
  if (detail.targetVersion) return '目标版本 ' + detail.targetVersion
  return ''
}

const PLATFORM_NAMES: Record<string, string> = {
  DOUYIN: '抖音', XIAOHONGSHU: '小红书', KUAISHOU: '快手', WECHAT_VIDEO: '视频号', DOUDIAN: '抖店',
}

function platformTags(row: CompanionDevice) {
  const summary = row.platformSummary || {}
  return Object.keys(summary).map((key) => {
    const p = summary[key] || {}
    const name = PLATFORM_NAMES[key] || key
    const cls = p.status === 'ok' ? 'ok' : p.status === 'expired' ? 'expired' : 'bad'
    const label = name + (p.status === 'ok' ? '·正常' : p.status === 'expired' ? '·登录失效' : '·异常')
    return { label, cls }
  })
}

function alertType(type: string): 'success' | 'warning' | 'danger' | 'info' {
  if (type === 'VERSION_OUTDATED') return 'warning'
  if (type === 'HEARTBEAT_STALE' || type === 'OFFLINE_24H') return 'danger'
  if (type === 'LOGIN_EXPIRED_MASS') return 'danger'
  return 'warning'
}

function alertTypeLabel(type: string): string {
  const map: Record<string, string> = {
    SYNC_FAIL_3X: '同步连续失败',
    OFFLINE_24H: '超24小时离线',
    HEARTBEAT_STALE: '心跳超时',
    TASK_TIMEOUT: '任务超时',
    UPDATE_FAILED: '自动更新失败',
    VERSION_OUTDATED: '版本过旧',
    HTTP_ERROR_SPIKE: '请求异常增多',
    LOGIN_EXPIRED_MASS: '登录态大量失效',
  }
  return map[type] || type
}

function deviceNameOf(deviceId: string | null): string {
  if (!deviceId) return ''
  const device = devices.value.find((d) => d.deviceId === deviceId)
  return device ? device.deviceName || deviceId : deviceId
}

function collectionBrief(value: any): string {
  if (!value || !Object.keys(value).length) return '-'
  const ok = value.success === true || value.success === 'true'
  return (ok ? '成功' : '失败') + (value.accountCount ? '·' + value.accountCount + '账号' : '')
}

function syncBrief(value: any): string {
  if (!value || !Object.keys(value).length) return '-'
  const ok = value.success === true || value.success === 'true'
  return (ok ? '成功' : '失败') + (value.uploadCount ? '·上传' + value.uploadCount : '') + (value.errorCode ? '·' + value.errorCode : '')
}

function errorBrief(value: any): string {
  if (!value || !Object.keys(value).length || !value.message) return '-'
  return (value.errorCode ? value.errorCode + ' ' : '') + String(value.message).slice(0, 60)
}

onMounted(async () => {
  await refreshAll()
  pollTimer = setInterval(() => {
    refreshAll().catch(() => undefined)
  }, 30000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<style scoped>
.companion-monitor { padding: 16px 20px; }
.cm-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 14px; }
.cm-header__title h2 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }
.cm-header__title p { color: #8a8f99; font-size: 12px; margin: 0; }
.cm-header__actions { display: flex; align-items: center; gap: 10px; }
.cm-refresh-at { color: #8a8f99; font-size: 12px; }
.cm-overview { margin-bottom: 12px; }
.cm-overview .el-col { margin-bottom: 12px; }
.cm-card { background: #fff; border: 1px solid #eef0f3; border-radius: 8px; padding: 12px 14px; text-align: center; }
.cm-card__num { font-size: 22px; font-weight: 700; line-height: 1.3; }
.cm-card__num--sm { font-size: 14px; padding-top: 6px; }
.cm-card__label { color: #8a8f99; font-size: 12px; margin-top: 2px; }
.cm-card--ok .cm-card__num { color: #34c759; }
.cm-card--warn .cm-card__num { color: #e6a23c; }
.cm-card--off .cm-card__num { color: #e05050; }
.cm-card--old .cm-card__num { color: #b06ab3; }
.cm-alerts { margin-bottom: 12px; }
.cm-alerts__head { display: flex; justify-content: space-between; align-items: center; }
.cm-alert-item { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px dashed #f0f2f5; font-size: 13px; }
.cm-alert-item:last-child { border-bottom: none; }
.cm-alert-item__msg { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-alert-item__dev { color: #8a8f99; font-size: 12px; white-space: nowrap; }
.cm-alert-item__time { color: #b0b4bb; font-size: 12px; white-space: nowrap; }
.cm-devices__head { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
.cm-cell-name { font-weight: 600; }
.cm-cell-sub { color: #8a8f99; font-size: 11px; }
.cm-muted { color: #b0b4bb; }
.cm-ok { color: #34c759; }
.cm-bad { color: #e05050; }
.cm-ellipsis { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cm-platforms { display: flex; flex-wrap: wrap; gap: 4px; }
.cm-platform { font-size: 11px; padding: 1px 6px; border-radius: 4px; border: 1px solid; }
.cm-platform--ok { color: #34c759; border-color: #d5f0dd; background: #f2fbf5; }
.cm-platform--expired { color: #e6a23c; border-color: #f3e4c8; background: #fdf7ec; }
.cm-platform--bad { color: #e05050; border-color: #f3d2d2; background: #fdf3f3; }
.cm-history-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
</style>
