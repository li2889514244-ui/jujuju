import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { UserRole } from '@prisma/client'
import * as crypto from 'crypto'
import * as os from 'os'
import { PrismaService } from '../../prisma/prisma.service'

type Severity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
type SourceType = 'FRONTEND' | 'BACKEND' | 'DATABASE' | 'COMPANION' | 'BUSINESS' | 'RELEASE'

interface CurrentUserLike {
  id?: string
  role?: string
  organizationId?: string | null
}

interface RecordSystemEventInput {
  sourceType: SourceType
  sourceId?: string | null
  organizationId?: string | null
  userId?: string | null
  deviceId?: string | null
  bootId?: string | null
  requestId?: string | null
  taskId?: string | null
  accountId?: string | null
  storeId?: string | null
  platform?: string | null
  frontendVersion?: string | null
  backendVersion?: string | null
  companionVersion?: string | null
  eventType: string
  severity?: Severity
  errorCode?: string | null
  message: string
  occurredAt?: Date
  metadata?: Record<string, unknown> | null
}

interface BackendHttpEventInput {
  requestId?: string
  method: string
  url: string
  statusCode: number
  durationMs: number
  userId?: string | null
  organizationId?: string | null
  userAgent?: string | null
  companionVersion?: string | null
  companionDevice?: string | null
  errorName?: string | null
  errorMessage?: string | null
}

@Injectable()
export class SystemHealthService {
  private readonly logger = new Logger(SystemHealthService.name)

  constructor(private readonly prisma: PrismaService) {}

  async recordFrontendEvent(user: CurrentUserLike, payload: Record<string, unknown>) {
    const sourceType = 'FRONTEND' as const
    const eventType = this.cleanText(payload.eventType, 80) || 'FRONTEND_ERROR'
    const severity = this.normalizeSeverity(payload.severity, 'ERROR')
    const route = this.sanitizePath(this.cleanText(payload.route, 180))
    const frontendVersion = this.cleanText(payload.frontendVersion, 80)
    const errorCode =
      this.cleanText(payload.errorCode, 100) ||
      this.buildErrorCode('FRONTEND', eventType, route || this.cleanText(payload.name, 80))
    const message = this.cleanText(payload.message, 500) || eventType
    if (this.isIgnoredFrontendNoise(message)) return { accepted: true, ignored: true }
    const stackFingerprint = this.cleanText(payload.stackFingerprint, 80) || this.fingerprint(message)
    const dedupeKey = [sourceType, errorCode, route, frontendVersion, stackFingerprint].filter(Boolean).join('|')

    await this.recordEvent({
      sourceType,
      sourceId: route,
      organizationId: user.organizationId ?? null,
      userId: user.id ?? null,
      requestId: this.cleanText(payload.requestId, 128),
      frontendVersion,
      eventType,
      severity,
      errorCode,
      message,
      occurredAt: this.clampOccurredAt(payload.occurredAt, new Date()),
      metadata: this.sanitizeMetadata({
        route,
        name: payload.name,
        stackTop: payload.stackTop,
        component: payload.component,
        info: payload.info,
        resourceTag: payload.resourceTag,
        resourceUrl: payload.resourceUrl,
        apiUrl: payload.apiUrl,
        statusCode: payload.statusCode,
        businessCode: payload.businessCode,
        durationMs: payload.durationMs,
        userAgent: payload.userAgent,
      }),
    })

    if (severity === 'ERROR' || severity === 'CRITICAL') {
      await this.recordIncident({
        sourceType,
        scope: route || 'frontend',
        organizationId: user.organizationId ?? null,
        errorCode,
        severity,
        title: this.titleForEvent(sourceType, eventType, message),
        summary: message,
        dedupeKey,
        metadata: { route, frontendVersion, stackFingerprint },
      })
    }

    return { accepted: true }
  }

  recordBackendHttpEventSafely(input: BackendHttpEventInput) {
    void this.recordBackendHttpEvent(input).catch((error: Error) => {
      this.logger.warn(`System health event write skipped: ${error.message}`)
    })
  }

  async recordBackendHttpEvent(input: BackendHttpEventInput) {
    const sourceType: SourceType = input.errorName?.startsWith('Prisma') ? 'DATABASE' : 'BACKEND'
    const slow = input.durationMs >= 1000
    const failed = input.statusCode >= 400
    if (!slow && !failed) return

    const severity = input.statusCode >= 500 ? 'ERROR' : 'WARNING'
    const eventType = input.statusCode >= 500 ? 'HTTP_5XX' : failed ? 'HTTP_4XX' : input.durationMs >= 3000 ? 'HTTP_SLOW' : 'HTTP_LATENCY'
    const errorCode =
      input.errorName ||
      (input.statusCode >= 500 ? 'BACKEND_HTTP_5XX' : failed ? `BACKEND_HTTP_${input.statusCode}` : 'BACKEND_HTTP_SLOW')
    const routeKey = `${input.method.toUpperCase()} ${this.routeFingerprint(input.url)}`
    const message = `${routeKey} ${input.statusCode} ${input.durationMs}ms`

    await this.recordEvent({
      sourceType,
      sourceId: routeKey,
      organizationId: input.organizationId ?? null,
      userId: input.userId ?? null,
      deviceId: input.companionDevice ?? null,
      requestId: input.requestId ?? null,
      companionVersion: input.companionVersion ?? null,
      eventType,
      severity,
      errorCode,
      message,
      metadata: this.sanitizeMetadata({
        method: input.method,
        url: input.url,
        statusCode: input.statusCode,
        durationMs: input.durationMs,
        userAgent: input.userAgent,
        errorName: input.errorName,
        errorMessage: input.errorMessage,
      }),
    })

    if (input.statusCode >= 500) {
      await this.recordIncident({
        sourceType,
        scope: routeKey,
        organizationId: input.organizationId ?? null,
        errorCode,
        severity: 'ERROR',
        title: `后端接口异常：${routeKey}`,
        summary: input.errorMessage || message,
        dedupeKey: [sourceType, routeKey, errorCode].join('|'),
        metadata: { statusCode: input.statusCode, durationMs: input.durationMs },
      })
    }
  }

  async getOverview(user: CurrentUserLike) {
    await this.syncCompanionIncidents(user)

    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const orgWhere = this.orgWhere(user)
    const scopedWhere = this.eventOrgWhere(user)

    const [
      frontendErrors,
      backendErrors,
      slowApis,
      dbErrors,
      companionDevices,
      companionIncidents,
      openIncidents,
      activeSystemIncidents,
      recoveringIncidents,
      todayResolved,
      unresolvedIncidents,
      openCritical,
      openError,
      dbStatus,
    ] = await Promise.all([
      this.prisma.systemEvent.count({
        where: { ...scopedWhere, sourceType: 'FRONTEND', severity: { in: ['ERROR', 'CRITICAL'] }, occurredAt: { gte: since24h } },
      }),
      this.prisma.systemEvent.count({
        where: { ...scopedWhere, sourceType: 'BACKEND', eventType: 'HTTP_5XX', occurredAt: { gte: since24h } },
      }),
      this.prisma.systemEvent.count({
        where: { ...scopedWhere, sourceType: 'BACKEND', eventType: { in: ['HTTP_SLOW', 'HTTP_LATENCY'] }, occurredAt: { gte: since24h } },
      }),
      this.prisma.systemEvent.count({
        where: { ...scopedWhere, sourceType: 'DATABASE', severity: { in: ['ERROR', 'CRITICAL'] }, occurredAt: { gte: since24h } },
      }),
      this.prisma.companionDevice.findMany({
        where: orgWhere,
        select: {
          healthStatus: true,
          consecutiveSyncFailures: true,
          lastCollectionSuccess: true,
          lastCollectionAt: true,
          lastSyncSuccess: true,
          lastSyncAt: true,
        },
      }),
      this.prisma.companionIncident.findMany({
        where: { ...orgWhere, status: { in: ['open', 'recovering'] } },
        select: { deviceId: true, organizationId: true },
      }),
      this.prisma.systemIncident.findMany({
        where: { ...this.incidentOrgWhere(user), status: 'OPEN', severity: { in: ['CRITICAL', 'ERROR'] } },
        orderBy: [{ severity: 'desc' }, { lastOccurredAt: 'desc' }],
        take: 8,
      }),
      this.prisma.systemIncident.findMany({
        where: { ...this.incidentOrgWhere(user), status: { in: ['OPEN', 'RECOVERING'] } },
        select: { sourceType: true },
      }),
      this.prisma.systemIncident.count({ where: { ...this.incidentOrgWhere(user), status: 'RECOVERING' } }),
      this.prisma.systemIncident.count({
        where: { ...this.incidentOrgWhere(user), status: 'RESOLVED', resolvedAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } },
      }),
      this.prisma.systemIncident.count({
        where: { ...this.incidentOrgWhere(user), status: { in: ['OPEN', 'RECOVERING'] } },
      }),
      this.prisma.systemIncident.count({
        where: { ...this.incidentOrgWhere(user), status: 'OPEN', severity: 'CRITICAL' },
      }),
      this.prisma.systemIncident.count({
        where: { ...this.incidentOrgWhere(user), status: 'OPEN', severity: 'ERROR' },
      }),
      this.checkDatabase(),
    ])

    const offlineCompanions = companionDevices.filter((device) => device.healthStatus === 'offline').length
    const failedCollectOrSync = companionDevices.filter(
      (device) =>
        (device.lastCollectionAt != null && device.lastCollectionSuccess === false) ||
        (device.lastSyncAt != null && device.lastSyncSuccess === false) ||
        device.consecutiveSyncFailures >= 3,
    ).length
    const companionActiveIncidentCount = companionIncidents.length
    const activeFrontendIncidents = activeSystemIncidents.filter((incident) => incident.sourceType === 'FRONTEND').length
    const activeBackendIncidents = activeSystemIncidents.filter((incident) => incident.sourceType === 'BACKEND').length
    // 一个设备可能同时有心跳、离线、版本等多条故障；健康卡展示受影响实体数，
    // 另行返回故障条数，避免“异常 6”大于“设备总数 3”的歧义。
    const affectedCompanionEntities = new Set(
      companionIncidents.map((incident) => incident.deviceId || `org:${incident.organizationId || 'default'}`),
    ).size
    const p0 = openCritical
    const p1 = openError

    // 总体状态基于“当前未恢复故障”，避免 24h 计数让已恢复的问题继续压住状态
    const overallStatus =
      p0 > 0 || dbStatus.status === 'error'
        ? 'CRITICAL'
          : p1 > 0
          ? 'INCIDENT'
          : unresolvedIncidents > 0 ||
              frontendErrors > 0 ||
              slowApis > 0 ||
              companionActiveIncidentCount > 0 ||
              offlineCompanions > 0
            ? 'DEGRADED'
            : 'HEALTHY'

    return {
      overallStatus,
      generatedAt: now.toISOString(),
      cards: {
        frontend: { status: activeFrontendIncidents > 0 ? 'DEGRADED' : 'HEALTHY', errors24h: frontendErrors, activeIncidents: activeFrontendIncidents },
        backend: {
          status: activeBackendIncidents > 0 ? 'INCIDENT' : slowApis > 0 ? 'DEGRADED' : 'HEALTHY',
          errors24h: backendErrors,
          slowApis24h: slowApis,
          activeIncidents: activeBackendIncidents,
        },
        database: { status: dbStatus.status === 'ok' ? 'HEALTHY' : 'CRITICAL', responseTimeMs: dbStatus.responseTimeMs },
        companion: {
          status: companionActiveIncidentCount || offlineCompanions ? 'DEGRADED' : 'HEALTHY',
          total: companionDevices.length,
          anomalies: affectedCompanionEntities,
          activeIncidents: companionActiveIncidentCount,
          offline: offlineCompanions,
          failedCollectOrSync,
        },
        business: { status: 'UNKNOWN', note: 'Phase 1 未接业务质量规则' },
        release: { status: 'UNKNOWN', note: 'Phase 1 未接发布事件' },
      },
      counters: {
        frontendErrors24h: frontendErrors,
        api50024h: backendErrors,
        slowApis24h: slowApis,
        dbErrors24h: dbErrors,
        companionAnomalies: affectedCompanionEntities,
        companionActiveIncidents: companionActiveIncidentCount,
        offlineCompanions,
        failedCollectOrSync,
        unresolvedIncidents,
        p0,
        p1,
        recoveringIncidents,
        todayResolvedIncidents: todayResolved,
      },
      actionItems: openIncidents.map((incident) => ({
        id: incident.id,
        severity: incident.severity,
        sourceType: incident.sourceType,
        title: incident.title,
        summary: incident.summary,
        status: incident.status,
        lastOccurredAt: incident.lastOccurredAt,
        occurrenceCount: incident.occurrenceCount,
      })),
      runtime: {
        backendVersion: process.env.npm_package_version || '1.0.0',
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        host: os.hostname(),
      },
    }
  }

  async listIncidents(user: CurrentUserLike, query: Record<string, unknown>) {
    await this.syncCompanionIncidents(user)

    const status = this.cleanText(query.status, 20)
    const sourceType = this.cleanText(query.sourceType, 30)
    const severity = this.cleanText(query.severity, 20)
    const where: Record<string, unknown> = { ...this.incidentOrgWhere(user) }
    if (status && status !== 'all') where.status = status.toUpperCase()
    if (sourceType) where.sourceType = sourceType.toUpperCase()
    if (severity) where.severity = severity.toUpperCase()

    const take = this.take(query.take, 100, 300)
    return this.prisma.systemIncident.findMany({
      where,
      orderBy: [{ status: 'asc' }, { lastOccurredAt: 'desc' }],
      take,
    })
  }

  async listEvents(user: CurrentUserLike, query: Record<string, unknown>) {
    const where: Record<string, unknown> = { ...this.eventOrgWhere(user) }
    const sourceType = this.cleanText(query.sourceType, 30)
    const requestId = this.cleanText(query.requestId, 128)
    const severity = this.cleanText(query.severity, 20)
    if (sourceType) where.sourceType = sourceType.toUpperCase()
    if (requestId) where.requestId = requestId
    if (severity) where.severity = severity.toUpperCase()

    return this.prisma.systemEvent.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: this.take(query.take, 100, 500),
    })
  }

  async acknowledgeIncident(user: CurrentUserLike, id: string) {
    const incident = await this.prisma.systemIncident.findFirst({
      where: { id, ...this.incidentOrgWhere(user) },
    })
    if (!incident) throw new NotFoundException('故障不存在')
    return this.prisma.systemIncident.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy: user.id || null,
      },
    })
  }

  /**
   * 故障自动恢复巡检（每分钟一次）。
   * 静默窗口策略：OPEN 超过阈值无新发生 → RECOVERING；RECOVERING 持续静默 → RESOLVED。
   * 只处理自动采集来源（FRONTEND/BACKEND/DATABASE/BUSINESS）；
   * COMPANION 故障状态由 CompanionIncident 同步维护，不在此覆盖。
   * 若发生新错误，recordIncident 会把故障重置回 OPEN 并清空 recoveryStartedAt。
   * 巡检失败只记 warn，绝不影响业务请求。
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweepIncidentRecovery() {
    try {
      const recoverAfterMs = this.envWindowMs('INCIDENT_RECOVER_AFTER_MINUTES', 10)
      const resolveAfterMs = this.envWindowMs('INCIDENT_RESOLVE_AFTER_MINUTES', 10)
      const now = new Date()
      const recoverThreshold = new Date(now.getTime() - recoverAfterMs)
      const resolveThreshold = new Date(now.getTime() - resolveAfterMs)
      const autoSources = ['FRONTEND', 'BACKEND', 'DATABASE', 'BUSINESS']

      const recovering = await this.prisma.systemIncident.updateMany({
        where: {
          status: 'OPEN',
          sourceType: { in: autoSources },
          lastOccurredAt: { lt: recoverThreshold },
        },
        data: { status: 'RECOVERING', recoveryStartedAt: now },
      })

      const resolved = await this.prisma.systemIncident.updateMany({
        where: {
          status: 'RECOVERING',
          sourceType: { in: autoSources },
          recoveryStartedAt: { lt: resolveThreshold },
          lastOccurredAt: { lt: resolveThreshold },
        },
        data: { status: 'RESOLVED', resolvedAt: now },
      })

      if (recovering.count > 0 || resolved.count > 0) {
        this.logger.log(
          `故障恢复巡检：${recovering.count} 个进入 RECOVERING，${resolved.count} 个进入 RESOLVED`,
        )
      }
    } catch (error: any) {
      this.logger.warn(`故障恢复巡检跳过：${error?.message || error}`)
    }
  }

  private syncChain: Promise<void> = Promise.resolve()

  /**
   * 串行化伴侣故障同步：前端刷新时 overview/incidents 会并行触发，
   * 若并发执行 findFirst→create 会产生重复 SystemIncident 行（生产已观察到）。
   * 单进程内按链式排队，保证同一时刻只有一个同步在跑。
   */
  private async syncCompanionIncidents(user: CurrentUserLike) {
    const run = () => this.performSyncCompanionIncidents(user)
    const next = this.syncChain.then(run, run)
    this.syncChain = next.catch(() => undefined)
    await next
  }

  private async performSyncCompanionIncidents(user: CurrentUserLike) {
    const orgWhere = this.orgWhere(user)
    const companionIncidents = await this.prisma.companionIncident.findMany({
      where: orgWhere,
      orderBy: { lastOccurredAt: 'desc' },
      take: 500,
    })

    for (const incident of companionIncidents) {
      const dedupeKey = [
        'COMPANION',
        incident.organizationId || 'default',
        incident.deviceId || 'org',
        incident.type,
      ].join('|')
      const existing = await this.prisma.systemIncident.findFirst({
        where: {
          dedupeKey,
          organizationId: incident.organizationId ?? null,
          status: { in: ['OPEN', 'RECOVERING'] },
        },
      })
      const mappedStatus = this.mapCompanionStatus(incident.status)
      if (existing) {
        await this.prisma.systemIncident.update({
          where: { id: existing.id },
          data: {
            status: mappedStatus,
            severity: this.mapCompanionSeverity(incident.type),
            summary: incident.message,
            lastOccurredAt: incident.lastOccurredAt,
            recoveryStartedAt: incident.recoveringSince,
            resolvedAt: incident.resolvedAt,
            occurrenceCount: Math.max(existing.occurrenceCount, incident.occurrences || 1),
            affectedDevices: incident.deviceId ? 1 : existing.affectedDevices,
            metadata: this.sanitizeMetadata({
              companionIncidentId: incident.id,
              deviceId: incident.deviceId,
              type: incident.type,
              durationSeconds: incident.durationSeconds,
            }) as any,
          },
        })
        continue
      }

      if (mappedStatus === 'RESOLVED') continue
      await this.prisma.systemIncident.create({
        data: {
          sourceType: 'COMPANION',
          scope: incident.deviceId || `organization:${incident.organizationId || 'default'}`,
          organizationId: incident.organizationId ?? null,
          errorCode: incident.type,
          severity: this.mapCompanionSeverity(incident.type),
          status: mappedStatus,
          firstOccurredAt: incident.firstOccurredAt,
          lastOccurredAt: incident.lastOccurredAt,
          recoveryStartedAt: incident.recoveringSince,
          resolvedAt: incident.resolvedAt,
          occurrenceCount: incident.occurrences || 1,
          affectedDevices: incident.deviceId ? 1 : 0,
          title: `伴侣异常：${this.companionIncidentLabel(incident.type)}`,
          summary: incident.message,
          dedupeKey,
          metadata: this.sanitizeMetadata({
            companionIncidentId: incident.id,
            deviceId: incident.deviceId,
            type: incident.type,
            durationSeconds: incident.durationSeconds,
          }) as any,
        },
      })
    }
  }

  private async recordEvent(input: RecordSystemEventInput) {
    await this.prisma.systemEvent.create({
      data: {
        sourceType: input.sourceType,
        sourceId: this.nullable(input.sourceId, 160),
        organizationId: this.nullable(input.organizationId, 80),
        userId: this.nullable(input.userId, 80),
        deviceId: this.nullable(input.deviceId, 128),
        bootId: this.nullable(input.bootId, 80),
        requestId: this.nullable(input.requestId, 128),
        taskId: this.nullable(input.taskId, 128),
        accountId: this.nullable(input.accountId, 80),
        storeId: this.nullable(input.storeId, 80),
        platform: this.nullable(input.platform, 40),
        frontendVersion: this.nullable(input.frontendVersion, 80),
        backendVersion: this.nullable(input.backendVersion || process.env.npm_package_version || '1.0.0', 80),
        companionVersion: this.nullable(input.companionVersion, 80),
        eventType: this.cleanText(input.eventType, 100) || 'UNKNOWN_EVENT',
        severity: this.normalizeSeverity(input.severity, 'INFO'),
        errorCode: this.nullable(input.errorCode, 120),
        message: this.cleanText(input.message, 1000) || 'System event',
        occurredAt: input.occurredAt || new Date(),
        metadata: (input.metadata || {}) as any,
      },
    })
  }

  private async recordIncident(input: {
    sourceType: SourceType
    scope: string
    organizationId?: string | null
    errorCode?: string | null
    severity: Severity
    title: string
    summary: string
    dedupeKey: string
    metadata?: Record<string, unknown>
  }) {
    const now = new Date()
    const existing = await this.prisma.systemIncident.findFirst({
      where: {
        dedupeKey: input.dedupeKey,
        organizationId: input.organizationId ?? null,
        status: { in: ['OPEN', 'RECOVERING'] },
      },
    })
    if (existing) {
      await this.prisma.systemIncident.update({
        where: { id: existing.id },
        data: {
          status: 'OPEN',
          severity: this.raiseSeverity(existing.severity, input.severity),
          summary: this.cleanText(input.summary, 1000) || existing.summary,
          lastOccurredAt: now,
          occurrenceCount: existing.occurrenceCount + 1,
          recoveryStartedAt: null,
          metadata: this.sanitizeMetadata(input.metadata || {}) as any,
        },
      })
      return
    }

    await this.prisma.systemIncident.create({
      data: {
        sourceType: input.sourceType,
        scope: this.cleanText(input.scope, 160) || 'global',
        organizationId: input.organizationId ?? null,
        errorCode: this.nullable(input.errorCode, 120),
        severity: input.severity,
        status: 'OPEN',
        firstOccurredAt: now,
        lastOccurredAt: now,
        title: this.cleanText(input.title, 180) || '系统异常',
        summary: this.cleanText(input.summary, 1000) || '系统异常',
        dedupeKey: this.cleanText(input.dedupeKey, 260) || this.fingerprint(input.title + input.summary),
        metadata: this.sanitizeMetadata(input.metadata || {}) as any,
      },
    })
  }

  private async checkDatabase(): Promise<{ status: 'ok' | 'error'; responseTimeMs?: number }> {
    try {
      const start = Date.now()
      await this.prisma.$queryRaw`SELECT 1`
      return { status: 'ok', responseTimeMs: Date.now() - start }
    } catch (error: any) {
      await this.recordEvent({
        sourceType: 'DATABASE',
        eventType: 'DB_HEALTH_CHECK_FAILED',
        severity: 'CRITICAL',
        errorCode: 'DATABASE_HEALTH_CHECK_FAILED',
        message: this.cleanText(error?.message, 300) || 'Database health check failed',
        metadata: {},
      }).catch(() => undefined)
      return { status: 'error' }
    }
  }

  private orgWhere(user: CurrentUserLike): Record<string, unknown> {
    return user.role === UserRole.SUPER_ADMIN ? {} : { organizationId: user.organizationId || null }
  }

  private eventOrgWhere(user: CurrentUserLike): Record<string, unknown> {
    return user.role === UserRole.SUPER_ADMIN ? {} : { organizationId: user.organizationId || null }
  }

  private incidentOrgWhere(user: CurrentUserLike): Record<string, unknown> {
    return user.role === UserRole.SUPER_ADMIN ? {} : { organizationId: user.organizationId || null }
  }

  private mapCompanionStatus(status: string): 'OPEN' | 'RECOVERING' | 'RESOLVED' {
    if (status === 'resolved') return 'RESOLVED'
    if (status === 'recovering') return 'RECOVERING'
    return 'OPEN'
  }

  private mapCompanionSeverity(type: string): Severity {
    if (['OFFLINE_24H', 'LOGIN_EXPIRED_MASS', 'CRASH_SUSPECTED'].includes(type)) return 'ERROR'
    if (['HEARTBEAT_STALE', 'TASK_STUCK', 'SYNC_FAIL_3X', 'UPDATE_FAILED', 'HTTP_ERROR_SPIKE'].includes(type)) {
      return 'WARNING'
    }
    return 'INFO'
  }

  private companionIncidentLabel(type: string): string {
    const labels: Record<string, string> = {
      SYNC_FAIL_3X: '连续同步失败',
      OFFLINE_24H: '超过24小时离线',
      HEARTBEAT_STALE: '心跳超时',
      TASK_STUCK: '任务卡住',
      TASK_TIMEOUT: '任务超时',
      UPDATE_FAILED: '自动更新失败',
      VERSION_OUTDATED: '版本过旧',
      HTTP_ERROR_SPIKE: 'HTTP 异常增多',
      LOGIN_EXPIRED_MASS: '大量登录态失效',
      CRASH_SUSPECTED: '疑似崩溃',
    }
    return labels[type] || type
  }

  private normalizeSeverity(value: unknown, fallback: Severity): Severity {
    const raw = this.cleanText(value, 20).toUpperCase()
    return ['INFO', 'WARNING', 'ERROR', 'CRITICAL'].includes(raw) ? (raw as Severity) : fallback
  }

  private raiseSeverity(current: string, incoming: Severity): string {
    const rank: Record<string, number> = { INFO: 0, WARNING: 1, ERROR: 2, CRITICAL: 3 }
    return (rank[incoming] ?? 0) >= (rank[current] ?? 0) ? incoming : current
  }

  private clampOccurredAt(value: unknown, now: Date): Date {
    const parsed = this.parseDate(value)
    if (!parsed) return now
    const min = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const max = new Date(now.getTime() + 5 * 60 * 1000)
    if (parsed < min || parsed > max) return now
    return parsed
  }

  private envWindowMs(key: string, fallbackMinutes: number): number {
    const parsed = Number(process.env[key])
    if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMinutes * 60 * 1000
    return Math.floor(parsed) * 60 * 1000
  }

  private take(value: unknown, fallback: number, max: number): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(max, Math.max(1, Math.floor(parsed)))
  }

  private parseDate(value: unknown): Date | null {
    if (typeof value !== 'string' || !value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  private nullable(value: unknown, max = 200): string | null {
    const text = this.cleanText(value, max)
    return text || null
  }

  private cleanText(value: unknown, max = 200): string {
    if (typeof value !== 'string' && typeof value !== 'number') return ''
    return String(value)
      .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***')
      .replace(/(token|password|cookie|secret)=([^&\s]+)/gi, '$1=***')
      .slice(0, max)
  }

  private isIgnoredFrontendNoise(message: string): boolean {
    return /ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/i.test(message)
  }

  private sanitizePath(value: string): string {
    if (!value) return ''
    return value.split('?')[0].slice(0, 180)
  }

  private routeFingerprint(value: string): string {
    return this.sanitizePath(value)
      .replace(/\/[A-Za-z0-9_-]{16,}/g, '/:id')
      .replace(/\/\d{5,}/g, '/:id')
  }

  private sanitizeMetadata(value: Record<string, unknown>): Record<string, unknown> {
    const safe: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(value || {})) {
      if (/password|token|cookie|secret|authorization/i.test(key)) continue
      if (raw === null || raw === undefined) continue
      if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
        safe[key] = this.cleanText(raw, 500)
      }
    }
    return safe
  }

  private buildErrorCode(prefix: string, eventType: string, scope: string): string {
    return `${prefix}_${eventType}_${this.fingerprint(scope || eventType).slice(0, 8)}`.toUpperCase()
  }

  private fingerprint(value: string): string {
    return crypto.createHash('sha1').update(value || 'unknown').digest('hex')
  }

  private titleForEvent(sourceType: SourceType, eventType: string, message: string): string {
    if (sourceType === 'FRONTEND') return `前端异常：${eventType}`
    return `${sourceType} ${eventType}: ${message}`.slice(0, 180)
  }
}
