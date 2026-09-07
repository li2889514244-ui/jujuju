import { get, post } from './request'

export type SystemHealthStatus = 'HEALTHY' | 'DEGRADED' | 'INCIDENT' | 'CRITICAL' | 'UNKNOWN'
export type SystemSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'

export interface SystemHealthCard {
  status: SystemHealthStatus
  errors24h?: number
  slowApis24h?: number
  responseTimeMs?: number
  total?: number
  anomalies?: number
  activeIncidents?: number
  offline?: number
  failedCollectOrSync?: number
  note?: string
}

export interface SystemActionItem {
  id: string
  severity: SystemSeverity
  sourceType: string
  title: string
  summary: string
  status: string
  lastOccurredAt: string
  occurrenceCount: number
}

export interface SystemHealthOverview {
  overallStatus: SystemHealthStatus
  generatedAt: string
  cards: {
    frontend: SystemHealthCard
    backend: SystemHealthCard
    database: SystemHealthCard
    companion: SystemHealthCard
    business: SystemHealthCard
    release: SystemHealthCard
  }
  counters: {
    frontendErrors24h: number
    api50024h: number
    slowApis24h: number
    dbErrors24h: number
    companionAnomalies: number
    companionActiveIncidents: number
    offlineCompanions: number
    failedCollectOrSync: number
    unresolvedIncidents: number
    p0: number
    p1: number
    recoveringIncidents: number
    todayResolvedIncidents: number
  }
  actionItems: SystemActionItem[]
  runtime: {
    backendVersion: string
    nodeVersion: string
    uptimeSeconds: number
    memoryMb: number
    host: string
  }
}

export interface SystemIncident {
  id: string
  sourceType: string
  scope: string
  organizationId: string | null
  errorCode: string | null
  severity: SystemSeverity
  status: string
  firstOccurredAt: string
  lastOccurredAt: string
  recoveryStartedAt: string | null
  resolvedAt: string | null
  occurrenceCount: number
  affectedUsers: number
  affectedDevices: number
  affectedAccounts: number
  affectedStores: number
  affectedVersions: Record<string, unknown> | null
  title: string
  summary: string
  rootCause: string | null
  resolution: string | null
  acknowledgedAt: string | null
  acknowledgedBy: string | null
  dedupeKey: string
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

export interface SystemEvent {
  id: string
  sourceType: string
  sourceId: string | null
  organizationId: string | null
  userId: string | null
  deviceId: string | null
  requestId: string | null
  eventType: string
  severity: SystemSeverity
  errorCode: string | null
  message: string
  occurredAt: string
  metadata: Record<string, unknown> | null
}

export function fetchSystemHealthOverview() {
  return get<SystemHealthOverview>('/system-health/overview')
}

export function fetchSystemIncidents(params?: {
  status?: string
  sourceType?: string
  severity?: string
  take?: number
}) {
  return get<SystemIncident[]>('/system-health/incidents', params)
}

export function acknowledgeSystemIncident(id: string) {
  return post<SystemIncident>(`/system-health/incidents/${id}/acknowledge`)
}

export function fetchSystemEvents(params?: {
  sourceType?: string
  severity?: string
  requestId?: string
  take?: number
}) {
  return get<SystemEvent[]>('/system-health/events', params)
}
