import { get, post } from './request'

// ===== Types =====（与后端 CompanionMonitor 模块对应）

export interface PlatformStatus {
  accountCount?: number
  expiredCount?: number
  status?: string // ok / expired / error
}

export interface CompanionDevice {
  id: string
  deviceId: string
  deviceName: string
  ownerUserId: string | null
  ownerName: string | null
  organizationId: string | null
  companionVersion: string
  startedAt: string | null
  firstSeenAt: string
  lastSeenAt: string | null
  lastHeartbeatAt: string | null
  healthStatus: string // online / unstable / offline / unknown
  currentTask: string | null
  currentTaskDetail: Record<string, unknown> | null
  taskStartedAt: string | null
  platformSummary: Record<string, PlatformStatus> | null
  lastCollectionAt: string | null
  lastCollectionSuccess: boolean | null
  lastCollectionAccountCount: number | null
  lastSyncAt: string | null
  lastSyncSuccess: boolean | null
  lastSyncUploadCount: number | null
  lastSyncErrorCode: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  lastErrorAt: string | null
  updateStatus: Record<string, unknown> | null
  cpuPercent: number | null
  memoryMb: number | null
  processUptimeSeconds: number | null
  consecutiveSyncFailures: number
  recentHttpErrors: Record<string, unknown> | null
  networkDiagnostic: Record<string, unknown> | null
}

export interface CompanionHeartbeat {
  id: string
  deviceId: string
  receivedAt: string
  companionVersion: string
  taskStatus: string | null
  taskDetail: Record<string, unknown> | null
  platformSummary: Record<string, PlatformStatus> | null
  lastCollection: Record<string, unknown> | null
  lastSync: Record<string, unknown> | null
  lastError: Record<string, unknown> | null
  update: Record<string, unknown> | null
  cpuPercent: number | null
  memoryMb: number | null
  processUptimeSeconds: number | null
  networkDiagnostic: Record<string, unknown> | null
}

export interface CompanionAlert {
  id: string
  deviceId: string | null
  type: string
  message: string
  status: string // open / acknowledged
  organizationId: string | null
  createdAt: string
}

export interface CompanionOverview {
  counts: { normal: number; abnormal: number; offline: number; versionOutdated: number }
  todayCollectionRate: number | null
  todaySyncRate: number | null
  deviceTotal: number
  latestVersion: string
}

// ===== API Calls =====（鉴权由全局 axios 拦截器注入；后台校验角色与租户）

/** 设备列表（filter: all/online/offline/abnormal/version_outdated/collecting/syncing） */
export function fetchCompanionDevices(filter?: string) {
  return get<{ devices: CompanionDevice[]; total: number }>('/companion-monitor/devices', {
    filter,
  })
}

/** 健康总览 */
export function fetchCompanionOverview() {
  return get<CompanionOverview>('/companion-monitor/overview')
}

/** 告警列表 */
export function fetchCompanionAlerts(status = 'open') {
  return get<CompanionAlert[]>('/companion-monitor/alerts', { status })
}

/** 确认告警 */
export function acknowledgeCompanionAlert(id: string) {
  return post<CompanionAlert>(`/companion-monitor/alerts/${id}/acknowledge`)
}

/** 单设备历史（心跳 + 告警） */
export function fetchCompanionDeviceHistory(deviceId: string, days = 7) {
  return get<{
    device: CompanionDevice
    heartbeats: CompanionHeartbeat[]
    alerts: CompanionAlert[]
  }>(`/companion-monitor/devices/${deviceId}/history`, { days })
}
