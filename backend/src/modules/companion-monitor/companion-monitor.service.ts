import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { UserRole } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

export interface HeartbeatPayload {
  deviceId?: unknown
  deviceName?: unknown
  companionVersion?: unknown
  startedAt?: unknown
  taskStatus?: unknown
  taskDetail?: unknown
  taskStartedAt?: unknown
  platformSummary?: unknown
  lastCollection?: unknown
  lastSync?: unknown
  lastError?: unknown
  update?: unknown
  recentHttpErrors?: unknown
  resources?: unknown
  // Phase 2
  bootId?: unknown
  seq?: unknown
  exitState?: unknown
  uiMode?: unknown
  startupDiagnostic?: unknown
  lastProgressAt?: unknown
}

const VALID_TASKS = ['idle', 'collecting', 'syncing', 'uploading', 'queued', 'updating', 'error'] as const
// Phase 2: 卡死判定阈值——任务长时间「无进展」才算卡死（有进度则正常）
const STUCK_NO_PROGRESS_MINUTES: Record<string, number> = { collecting: 15, syncing: 10, uploading: 10, updating: 30 }
const HISTORY_WRITE_INTERVAL_MS = 5 * 60 * 1000
const CRASH_WINDOW_MS = 10 * 60 * 1000 // 上次心跳距新启动 ≤10 分钟 → 视为「运行中突然死亡」
const RECOVERY_GRACE_MS = 2 * 60 * 1000 // 连续 2 分钟不再复发才 RESOLVED

function parseVersion(value: unknown): number[] {
  return String(value || '').trim().split('.').map((part) => parseInt(part, 10)).filter((n) => Number.isFinite(n))
}

function compareVersions(a: string, b: string): number {
  const av = parseVersion(a)
  const bv = parseVersion(b)
  const len = Math.max(av.length, bv.length)
  for (let i = 0; i < len; i++) {
    const diff = (av[i] || 0) - (bv[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function readJson(value: unknown): Record<string, any> {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>
  return {}
}

function str(value: unknown, max = 200): string {
  return String(value ?? '').slice(0, max)
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

@Injectable()
export class CompanionMonitorService {
  private readonly logger = new Logger(CompanionMonitorService.name)

  constructor(private prisma: PrismaService) {}

  // ── 心跳接收 ──

  async processHeartbeat(user: { id: string; name?: string; organizationId?: string | null }, payload: HeartbeatPayload) {
    const deviceId = str(payload.deviceId, 128).trim()
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) {
      throw new ForbiddenException('无效的 deviceId')
    }

    const now = new Date()
    const existing = await this.prisma.companionDevice.findUnique({ where: { deviceId } })

    // Phase 2: 运行周期字段
    const bootId = str(payload.bootId, 64) || null
    const seqRaw = Number(payload.seq)
    const seq = Number.isFinite(seqRaw) && seqRaw > 0 ? Math.floor(seqRaw) : null
    const exitState = payload.exitState === 'clean' ? 'clean' : null
    const startedAtRaw = str(payload.startedAt)
    const startedAt = validDate(startedAtRaw)

    // Phase 2: 防旧心跳覆盖新状态
    let isNewBoot = false
    let isStale = false
    if (bootId && existing?.bootId) {
      if (bootId === existing.bootId) {
        // 同一运行周期：seq 必须严格递增，否则是迟到的旧心跳
        if (seq !== null && (existing.bootSeq || 0) > 0 && seq <= existing.bootSeq) isStale = true
      } else if (startedAt && existing.startedAt && startedAt.getTime() < new Date(existing.startedAt).getTime()) {
        // 不同 bootId 且 startedAt 更早：上一个运行周期迟到的旧心跳
        isStale = true
      } else {
        isNewBoot = true
      }
    }
    if (isStale) {
      const latestVersion = this.latestVersionFromEnvOrPayload(payload, existing)
      return { latestVersion, serverTime: now.toISOString(), stale: true }
    }

    // Phase 2: 崩溃检测（新运行周期开始前，用旧记录判断上一次是否异常退出）
    if (isNewBoot && existing && existing.bootId) {
      const prevLastHb = existing.lastHeartbeatAt ? new Date(existing.lastHeartbeatAt).getTime() : 0
      const newStartMs = startedAt ? startedAt.getTime() : now.getTime()
      const diedSuddenly = prevLastHb > 0 && newStartMs - prevLastHb < CRASH_WINDOW_MS
      if (diedSuddenly && existing.exitState !== 'clean') {
        await this.recordIncident(
          { deviceId, organizationId: existing.organizationId, deviceName: existing.deviceName },
          'CRASH_SUSPECTED',
          '上次运行未正常退出（疑似崩溃或被强制结束）',
        )
      }
      await this.prisma.companionEvent.create({
        data: {
          deviceId,
          type: 'BOOT_STARTED',
          message: '伴侣启动（新运行周期）',
          organizationId: existing.organizationId ?? null,
        },
      })
    }

    const taskStatusRaw = str(payload.taskStatus)
    const taskStatus = VALID_TASKS.includes(taskStatusRaw as any)
      ? taskStatusRaw
      : existing?.currentTask || 'idle'
    const lastSync = readJson(payload.lastSync)
    const lastError = readJson(payload.lastError)
    const updateInfo = readJson(payload.update)
    const resources = readJson(payload.resources)
    const taskStartedAtRaw = str(payload.taskStartedAt)
    const taskStartedAt = validDate(taskStartedAtRaw)

    let consecutiveSyncFailures = existing?.consecutiveSyncFailures ?? 0
    const syncSuccess = lastSync.success === true || lastSync.success === 'true'
    const syncFailed = lastSync.success === false || lastSync.success === 'false'
    if (lastSync && syncFailed) {
      consecutiveSyncFailures += 1
    } else if (syncSuccess) {
      consecutiveSyncFailures = 0
    }

    const lastSyncAtRaw = str(lastSync.at)
    const lastErrorAtRaw = str(lastError.at)
    const platformSummary = readJson(payload.platformSummary)
    const collectionInfo = readJson(payload.lastCollection)
    const collectionEndedAt = str(collectionInfo.endedAt)
    const hasSync = Object.keys(lastSync).length > 0
    const hasError = Object.keys(lastError).length > 0
    const hasCollection = Object.keys(collectionInfo).length > 0
    const hasTaskDetail = Object.keys(readJson(payload.taskDetail)).length > 0
    const hasHttpErrors = Object.keys(readJson(payload.recentHttpErrors)).length > 0
    const startupDiagnostic = readJson(payload.startupDiagnostic)
    const hasStartupDiagnostic = Object.keys(startupDiagnostic).length > 0
    const lastProgressAt = validDate(str(payload.lastProgressAt))

    const device = await this.prisma.companionDevice.upsert({
      where: { deviceId },
      update: {
        deviceName: str(payload.deviceName, 120) || existing?.deviceName || '',
        ownerUserId: user.id,
        ownerName: user.name || existing?.ownerName || '',
        organizationId: user.organizationId || null,
        companionVersion: str(payload.companionVersion, 40),
        startedAt: startedAt ? startedAt : existing?.startedAt || null,
        lastSeenAt: now,
        lastHeartbeatAt: now,
        currentTask: taskStatus,
        currentTaskDetail: hasTaskDetail ? readJson(payload.taskDetail) : ((existing?.currentTaskDetail ?? {}) as any),
        taskStartedAt:
          payload.taskStartedAt !== undefined && payload.taskStartedAt !== null
            ? taskStartedAt
            : existing?.taskStartedAt ?? null,
        platformSummary: Object.keys(platformSummary).length ? platformSummary : ((existing?.platformSummary ?? {}) as any),
        lastCollectionAt: hasCollection
          ? collectionEndedAt && !Number.isNaN(new Date(collectionEndedAt).getTime())
            ? new Date(collectionEndedAt)
            : existing?.lastCollectionAt
          : existing?.lastCollectionAt,
        lastCollectionSuccess: hasCollection ? collectionInfo.success === true : existing?.lastCollectionSuccess,
        lastCollectionAccountCount: hasCollection
          ? Number(collectionInfo.accountCount) || 0
          : existing?.lastCollectionAccountCount,
        lastSyncAt: lastSyncAtRaw && !Number.isNaN(new Date(lastSyncAtRaw).getTime()) ? new Date(lastSyncAtRaw) : existing?.lastSyncAt,
        lastSyncSuccess: hasSync && (syncSuccess || syncFailed) ? syncSuccess : existing?.lastSyncSuccess,
        lastSyncUploadCount: hasSync ? Number(lastSync.uploadCount) || 0 : existing?.lastSyncUploadCount,
        lastSyncErrorCode: hasSync ? str(lastSync.errorCode, 80) : existing?.lastSyncErrorCode,
        lastErrorCode: hasError ? str(lastError.errorCode, 80) : existing?.lastErrorCode,
        lastErrorMessage: hasError ? str(lastError.message, 300) : existing?.lastErrorMessage,
        lastErrorAt: hasError
          ? lastErrorAtRaw && !Number.isNaN(new Date(lastErrorAtRaw).getTime())
            ? new Date(lastErrorAtRaw)
            : existing?.lastErrorAt
          : existing?.lastErrorAt,
        updateStatus: Object.keys(updateInfo).length ? updateInfo : ((existing?.updateStatus ?? {}) as any),
        cpuPercent: Number.isFinite(Number(resources.cpuPercent)) ? Number(resources.cpuPercent) : existing?.cpuPercent,
        memoryMb: Number.isFinite(Number(resources.memoryMb)) ? Number(resources.memoryMb) : existing?.memoryMb,
        processUptimeSeconds: Number(resources.processUptimeSeconds) || 0,
        consecutiveSyncFailures,
        recentHttpErrors: hasHttpErrors ? readJson(payload.recentHttpErrors) : ((existing?.recentHttpErrors ?? {}) as any),
        // Phase 2
        bootId: bootId ?? existing?.bootId,
        bootSeq: bootId && seq !== null ? seq : isNewBoot ? 0 : existing?.bootSeq ?? 0,
        bootCount: isNewBoot ? (existing?.bootCount ?? 0) + 1 : existing?.bootCount ?? 0,
        exitState: exitState !== null ? exitState : isNewBoot ? null : existing?.exitState ?? null,
        uiMode: str(payload.uiMode, 20) || existing?.uiMode || '',
        startupDiagnostic: hasStartupDiagnostic ? startupDiagnostic : ((existing?.startupDiagnostic ?? {}) as any),
        lastProgressAt: lastProgressAt ? lastProgressAt : existing?.lastProgressAt,
      },
      create: {
        deviceId,
        deviceName: str(payload.deviceName, 120),
        ownerUserId: user.id,
        ownerName: user.name || '',
        organizationId: user.organizationId || null,
        companionVersion: str(payload.companionVersion, 40),
        startedAt: startedAt,
        firstSeenAt: now,
        lastSeenAt: now,
        lastHeartbeatAt: now,
        healthStatus: 'online',
        currentTask: taskStatus,
        currentTaskDetail: readJson(payload.taskDetail),
        taskStartedAt,
        platformSummary,
        lastCollectionAt: collectionEndedAt && !Number.isNaN(new Date(collectionEndedAt).getTime()) ? new Date(collectionEndedAt) : null,
        lastCollectionSuccess: collectionInfo.success === true ? true : false,
        lastCollectionAccountCount: Number(collectionInfo.accountCount) || 0,
        lastSyncAt: lastSyncAtRaw && !Number.isNaN(new Date(lastSyncAtRaw).getTime()) ? new Date(lastSyncAtRaw) : null,
        lastSyncSuccess: hasSync && (syncSuccess || syncFailed) ? syncSuccess : null,
        lastSyncUploadCount: Number(lastSync.uploadCount) || 0,
        lastSyncErrorCode: str(lastSync.errorCode, 80),
        lastErrorCode: str(lastError.errorCode, 80),
        lastErrorMessage: str(lastError.message, 300),
        lastErrorAt: lastErrorAtRaw && !Number.isNaN(new Date(lastErrorAtRaw).getTime()) ? new Date(lastErrorAtRaw) : null,
        updateStatus: updateInfo,
        cpuPercent: Number.isFinite(Number(resources.cpuPercent)) ? Number(resources.cpuPercent) : null,
        memoryMb: Number.isFinite(Number(resources.memoryMb)) ? Number(resources.memoryMb) : null,
        processUptimeSeconds: Number(resources.processUptimeSeconds) || 0,
        consecutiveSyncFailures,
        recentHttpErrors: readJson(payload.recentHttpErrors),
        bootId,
        bootSeq: seq ?? 0,
        bootCount: 1,
        exitState: exitState,
        uiMode: str(payload.uiMode, 20),
        startupDiagnostic: readJson(payload.startupDiagnostic),
        lastProgressAt,
      },
    })

    const shouldWriteHistory = await this.shouldWriteHistory(device, payload, taskStatus, now, bootId)
    if (shouldWriteHistory) {
      await this.prisma.companionHeartbeat.create({
        data: {
          deviceId,
          receivedAt: now,
          companionVersion: device.companionVersion,
          taskStatus,
          taskDetail: readJson(payload.taskDetail),
          platformSummary: device.platformSummary as any,
          lastCollection: readJson(payload.lastCollection),
          lastSync: readJson(payload.lastSync),
          lastError: readJson(payload.lastError),
          update: readJson(payload.update),
          cpuPercent: device.cpuPercent,
          memoryMb: device.memoryMb,
          processUptimeSeconds: device.processUptimeSeconds,
          ownerName: device.ownerName,
          bootId: device.bootId,
          seq: device.bootSeq,
        },
      })
    }

    const latestVersion = this.latestVersionFromEnvOrPayload(payload, device)
    return { latestVersion, serverTime: now.toISOString() }
  }

  private latestVersionFromEnvOrPayload(payload: HeartbeatPayload, device: any): string {
    return (
      process.env.COMPANION_LATEST_VERSION ||
      str((readJson(payload.update) as any).latest, 40) ||
      device?.companionVersion ||
      ''
    )
  }

  private async shouldWriteHistory(
    device: any,
    payload: HeartbeatPayload,
    taskStatus: string,
    now: Date,
    bootId: string | null,
  ): Promise<boolean> {
    const last = await this.prisma.companionHeartbeat.findFirst({
      where: { deviceId: device.deviceId },
      orderBy: { receivedAt: 'desc' },
      select: { receivedAt: true, taskStatus: true, lastSync: true, lastError: true, bootId: true },
    })
    if (!last) return true
    if (now.getTime() - last.receivedAt.getTime() >= HISTORY_WRITE_INTERVAL_MS) return true
    // Phase 2: 新运行周期必写一条历史
    if ((last.bootId || '') !== (bootId || '')) return true
    if ((last.taskStatus || 'idle') !== taskStatus) return true
    const newSync = readJson(payload.lastSync)
    const oldSync = readJson(last.lastSync)
    if (Boolean(newSync.success) !== Boolean(oldSync.success)) return true
    const newErr = readJson(payload.lastError)
    const oldErr = readJson(last.lastError)
    if (str(newErr.errorCode) !== str(oldErr.errorCode) || str(newErr.message) !== str(oldErr.message)) return true
    const collection = readJson(payload.lastCollection)
    if (collection.success === true) return true
    const updateInfo = readJson(payload.update)
    if (['success', 'failed'].includes(str(updateInfo.state))) return true
    return false
  }

  // ── 定时任务：健康状态刷新 + 故障/告警评估（Event + Incident 闭环） ──

  @Cron(CronExpression.EVERY_MINUTE)
  async evaluateHealthAndAlerts() {
    const now = new Date()
    const devices = await this.prisma.companionDevice.findMany({
      where: { lastHeartbeatAt: { not: null } },
      select: {
        id: true, deviceId: true, organizationId: true, deviceName: true,
        lastHeartbeatAt: true, healthStatus: true, currentTask: true, taskStartedAt: true,
        lastProgressAt: true, consecutiveSyncFailures: true, companionVersion: true, updateStatus: true,
        recentHttpErrors: true, platformSummary: true,
      },
    })

    let latestReported = process.env.COMPANION_LATEST_VERSION || ''
    for (const d of devices) {
      const reported = str((readJson(d.updateStatus) as any).latest, 40)
      if (reported && (!latestReported || compareVersions(reported, latestReported) > 0)) {
        latestReported = reported
      }
    }

    const firingKeys = new Set<string>()
    const staleMs = 5 * 60 * 1000
    const unstableMs = 2 * 60 * 1000
    const offline24hMs = 24 * 60 * 60 * 1000

    for (const d of devices) {
      const gap = now.getTime() - (d.lastHeartbeatAt ? new Date(d.lastHeartbeatAt).getTime() : 0)
      let health = 'online'
      if (gap > staleMs) health = 'offline'
      else if (gap > unstableMs) health = 'unstable'
      if (health !== d.healthStatus) {
        await this.prisma.companionDevice.update({ where: { id: d.id }, data: { healthStatus: health } })
      }

      if (health === 'offline') {
        await this.recordIncident(d, 'HEARTBEAT_STALE', '心跳超过5分钟未收到（最后心跳 ' + d.lastHeartbeatAt + '）')
        firingKeys.add(d.deviceId + '|HEARTBEAT_STALE')
      }
      if (gap > offline24hMs) {
        await this.recordIncident(d, 'OFFLINE_24H', '设备超过24小时未上线')
        firingKeys.add(d.deviceId + '|OFFLINE_24H')
      }
      if (d.consecutiveSyncFailures >= 3) {
        await this.recordIncident(d, 'SYNC_FAIL_3X', '连续 ' + d.consecutiveSyncFailures + ' 次同步失败')
        firingKeys.add(d.deviceId + '|SYNC_FAIL_3X')
      }
      // Phase 2: 卡死判定——按「无进展时长」而非总运行时长
      if (health !== 'offline' && d.currentTask && STUCK_NO_PROGRESS_MINUTES[d.currentTask] && d.taskStartedAt) {
        const progressAt = d.lastProgressAt ? new Date(d.lastProgressAt).getTime() : new Date(d.taskStartedAt).getTime()
        const noProgressMs = now.getTime() - progressAt
        const thresholdMs = STUCK_NO_PROGRESS_MINUTES[d.currentTask] * 60 * 1000
        if (noProgressMs > thresholdMs) {
          await this.recordIncident(
            d,
            'TASK_STUCK',
            '任务 ' + d.currentTask + ' 已 ' + Math.round(noProgressMs / 60000) + ' 分钟无进展',
          )
          firingKeys.add(d.deviceId + '|TASK_STUCK')
        }
      }
      const updateState = str((readJson(d.updateStatus) as any).state)
      if (updateState === 'failed') {
        await this.recordIncident(d, 'UPDATE_FAILED', '伴侣自动更新失败')
        firingKeys.add(d.deviceId + '|UPDATE_FAILED')
      }
      if (latestReported && d.companionVersion && compareVersions(d.companionVersion, latestReported) < 0) {
        await this.recordIncident(d, 'VERSION_OUTDATED', '版本过旧：' + d.companionVersion + ' < ' + latestReported)
        firingKeys.add(d.deviceId + '|VERSION_OUTDATED')
      }
      const httpErrors = readJson(d.recentHttpErrors)
      const httpTotal = Number(httpErrors.count403 || 0) + Number(httpErrors.count404 || 0) + Number(httpErrors.count500 || 0)
      if (httpTotal >= 10) {
        await this.recordIncident(d, 'HTTP_ERROR_SPIKE', '近期 403/404/500 异常请求 ' + httpTotal + ' 次')
        firingKeys.add(d.deviceId + '|HTTP_ERROR_SPIKE')
      }
    }

    await this.evaluateMassLoginExpiry(now, firingKeys)
    await this.sweepRecovery(firingKeys, now)
  }

  private async evaluateMassLoginExpiry(now: Date, firingKeys: Set<string>) {
    const devices = await this.prisma.companionDevice.findMany({
      where: { lastHeartbeatAt: { gt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      select: { organizationId: true, platformSummary: true },
    })
    const byOrg = new Map<string, { accounts: number; expired: number }>()
    for (const d of devices) {
      const key = d.organizationId || 'default'
      const bucket = byOrg.get(key) || { accounts: 0, expired: 0 }
      const summary = readJson(d.platformSummary)
      for (const platformKey of Object.keys(summary)) {
        const p = readJson(summary[platformKey])
        bucket.accounts += Number(p.accountCount) || 0
        bucket.expired += Number(p.expiredCount) || 0
      }
      byOrg.set(key, bucket)
    }
    for (const [orgId, bucket] of byOrg.entries()) {
      if (bucket.accounts >= 4 && bucket.expired / bucket.accounts > 0.5) {
        await this.recordIncident(
          { deviceId: null, organizationId: orgId },
          'LOGIN_EXPIRED_MASS',
          '组织内大量账号登录态失效（' + bucket.expired + '/' + bucket.accounts + '）',
        )
        firingKeys.add('org:' + orgId + '|LOGIN_EXPIRED_MASS')
      }
    }
  }

  // ── Event + Incident：故障聚合与生命周期 ──

  private async recordIncident(
    device: { deviceId?: string | null; organizationId?: string | null; deviceName?: string | null },
    type: string,
    message: string,
  ) {
    const now = new Date()
    const incidentWhere: any = device.deviceId
      ? { deviceId: device.deviceId, type, status: { in: ['open', 'recovering'] } }
      : { deviceId: null, organizationId: device.organizationId ?? null, type, status: { in: ['open', 'recovering'] } }

    const existing = await this.prisma.companionIncident.findFirst({ where: incidentWhere })
    if (existing) {
      const data =
        existing.status === 'recovering'
          ? { occurrences: existing.occurrences + 1, lastOccurredAt: now, message, status: 'open', recoveringSince: null }
          : { lastOccurredAt: now, message, status: 'open', recoveringSince: null }
      await this.prisma.companionIncident.update({
        where: { id: existing.id },
        data,
      })
      // 事件只在「新发作段」开始记一条（恢复后复发才算新发作段）
      if (existing.status === 'recovering') {
        await this.prisma.companionEvent.create({
          data: { deviceId: device.deviceId ?? null, type, message, organizationId: device.organizationId ?? null },
        })
      }
    } else {
      await this.prisma.companionIncident.create({
        data: { deviceId: device.deviceId ?? null, type, message, organizationId: device.organizationId ?? null },
      })
      await this.prisma.companionEvent.create({
        data: { deviceId: device.deviceId ?? null, type, message, organizationId: device.organizationId ?? null },
      })
    }

    // Phase 1 兼容：保持告警行（同设备同类型去重），页面继续可用
    const alertWhere: any = device.deviceId
      ? { deviceId: device.deviceId, type, status: 'open' }
      : { deviceId: null, organizationId: device.organizationId ?? null, type, status: 'open' }
    const existsAlert = await this.prisma.companionAlert.findFirst({ where: alertWhere })
    if (!existsAlert) {
      await this.prisma.companionAlert.create({
        data: { deviceId: device.deviceId ?? null, type, message, organizationId: device.organizationId ?? null },
      })
    }
  }

  private async sweepRecovery(firingKeys: Set<string>, now: Date) {
    const incidents = await this.prisma.companionIncident.findMany({
      where: { status: { in: ['open', 'recovering'] } },
      select: { id: true, deviceId: true, type: true, organizationId: true, status: true, recoveringSince: true, firstOccurredAt: true },
    })
    for (const inc of incidents) {
      const key = inc.deviceId
        ? inc.deviceId + '|' + inc.type
        : 'org:' + (inc.organizationId ?? '') + '|' + inc.type
      if (firingKeys.has(key)) continue // 本轮仍在发生，跳过

      if (inc.status === 'open') {
        // 第一次不再发生：进入 RECOVERING（记录恢复时刻）
        await this.prisma.companionIncident.update({
          where: { id: inc.id },
          data: { status: 'recovering', recoveringSince: now, recoveredAt: now },
        })
      } else {
        const since = inc.recoveringSince ? new Date(inc.recoveringSince).getTime() : 0
        if (now.getTime() - since >= RECOVERY_GRACE_MS) {
          // 连续 2 分钟无复发：自动 RESOLVED + 时长
          const first = new Date(inc.firstOccurredAt).getTime()
          await this.prisma.companionIncident.update({
            where: { id: inc.id },
            data: {
              status: 'resolved',
              resolvedAt: now,
              durationSeconds: Math.max(0, Math.round((now.getTime() - first) / 1000)),
            },
          })
          // Phase 1 兼容：同类型未处理告警自动关闭
          await this.prisma.companionAlert.updateMany({
            where: {
              type: inc.type,
              status: 'open',
              deviceId: inc.deviceId ?? null,
              organizationId: inc.organizationId ?? null,
            },
            data: { status: 'resolved' },
          })
        }
      }
    }
  }

  @Cron('30 3 * * *', { timeZone: 'Asia/Shanghai' })
  async cleanupOldRecords() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const hb = await this.prisma.companionHeartbeat.deleteMany({ where: { receivedAt: { lt: cutoff } } })
    const events = await this.prisma.companionEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })
    const alerts = await this.prisma.companionAlert.deleteMany({
      where: {
        OR: [
          { createdAt: { lt: cutoff } },
          { status: 'acknowledged', createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        ],
      },
    })
    const incidents = await this.prisma.companionIncident.deleteMany({
      where: { status: 'resolved', resolvedAt: { lt: cutoff } },
    })
    this.logger.log(
      'Companion monitor cleanup: heartbeats=' + hb.count + ' events=' + events.count + ' alerts=' + alerts.count + ' incidents=' + incidents.count,
    )
  }

  // ── 查询接口 ──

  async listDevices(user: { role?: string; organizationId?: string | null }, filter?: string) {
    const orgWhere = user.role === UserRole.SUPER_ADMIN ? {} : { organizationId: user.organizationId || null }
    const where: any = { ...orgWhere }
    if (filter === 'online') where.healthStatus = 'online'
    if (filter === 'offline') where.healthStatus = 'offline'
    if (filter === 'collecting') where.currentTask = 'collecting'
    if (filter === 'syncing') where.currentTask = 'syncing'
    if (filter === 'abnormal') {
      where.OR = [
        { healthStatus: 'offline' },
        { healthStatus: 'unstable' },
        { consecutiveSyncFailures: { gte: 3 } },
        { lastErrorCode: { not: null } },
      ]
    }
    const devices = await this.prisma.companionDevice.findMany({ where, orderBy: { lastHeartbeatAt: 'desc' } })
    if (filter === 'version_outdated') {
      let latest = process.env.COMPANION_LATEST_VERSION || ''
      for (const d of devices) {
        const reported = str((readJson(d.updateStatus) as any).latest, 40)
        if (reported && (!latest || compareVersions(reported, latest) > 0)) latest = reported
      }
      const filtered = latest
        ? devices.filter((d) => d.companionVersion && compareVersions(d.companionVersion, latest) < 0)
        : []
      return { devices: filtered, total: filtered.length }
    }
    return { devices, total: devices.length }
  }

  async getDeviceHistory(user: { role?: string; organizationId?: string | null }, deviceId: string, days = 7) {
    const device = await this.prisma.companionDevice.findUnique({ where: { deviceId } })
    if (!device) throw new NotFoundException('设备不存在')
    if (user.role !== UserRole.SUPER_ADMIN && device.organizationId && device.organizationId !== (user.organizationId || null)) {
      throw new ForbiddenException('No access to this device')
    }
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    const heartbeats = await this.prisma.companionHeartbeat.findMany({
      where: { deviceId, receivedAt: { gte: start } },
      orderBy: { receivedAt: 'desc' },
      take: 5000,
    })
    const alerts = await this.prisma.companionAlert.findMany({
      where: { deviceId, createdAt: { gte: start } },
      orderBy: { createdAt: 'desc' },
    })
    const incidents = await this.prisma.companionIncident.findMany({
      where: { deviceId, firstOccurredAt: { gte: start } },
      orderBy: { firstOccurredAt: 'desc' },
    })
    return { device, heartbeats, alerts, incidents }
  }

  async getOverview(user: { role?: string; organizationId?: string | null }) {
    const orgWhere = user.role === UserRole.SUPER_ADMIN ? {} : { organizationId: user.organizationId || null }
    const devices = await this.prisma.companionDevice.findMany({
      where: orgWhere,
      select: {
        healthStatus: true, consecutiveSyncFailures: true, lastCollectionSuccess: true,
        lastSyncSuccess: true, companionVersion: true, updateStatus: true,
        lastCollectionAt: true, lastSyncAt: true,
      },
    })
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const counts = { normal: 0, abnormal: 0, offline: 0, versionOutdated: 0 }
    let latestReported = process.env.COMPANION_LATEST_VERSION || ''
    for (const d of devices) {
      const reported = str((readJson(d.updateStatus) as any).latest, 40)
      if (reported && (!latestReported || compareVersions(reported, latestReported) > 0)) latestReported = reported
    }
    for (const d of devices) {
      if (d.healthStatus === 'offline') counts.offline += 1
      else if (d.consecutiveSyncFailures >= 3 || d.healthStatus === 'unstable') counts.abnormal += 1
      else counts.normal += 1
      if (latestReported && d.companionVersion && compareVersions(d.companionVersion, latestReported) < 0) counts.versionOutdated += 1
    }
    const todayCollection = devices.filter((d) => d.lastCollectionAt && new Date(d.lastCollectionAt) >= todayStart)
    const todaySync = devices.filter((d) => d.lastSyncAt && new Date(d.lastSyncAt) >= todayStart)
    return {
      counts,
      todayCollectionRate: todayCollection.length ? Math.round((todayCollection.filter((d) => d.lastCollectionSuccess === true).length / todayCollection.length) * 100) : null,
      todaySyncRate: todaySync.length ? Math.round((todaySync.filter((d) => d.lastSyncSuccess === true).length / todaySync.length) * 100) : null,
      deviceTotal: devices.length,
      latestVersion: latestReported,
    }
  }

  async listAlerts(user: { role?: string; organizationId?: string | null }, status = 'open') {
    const orgWhere = user.role === UserRole.SUPER_ADMIN ? {} : { organizationId: user.organizationId || null }
    const where: any = { ...orgWhere }
    if (status && status !== 'all') where.status = status
    return this.prisma.companionAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
  }

  async acknowledgeAlert(id: string, user?: { id?: string; role?: string; organizationId?: string | null }) {
    const orgWhere = user?.role === UserRole.SUPER_ADMIN ? {} : { organizationId: user?.organizationId || null }
    const alert = await this.prisma.companionAlert.findFirst({ where: { id, ...orgWhere } })
    if (!alert) throw new NotFoundException('告警不存在')
    return this.prisma.companionAlert.update({
      where: { id },
      data: {
        status: 'acknowledged',
        acknowledgedAt: new Date(),
        acknowledgedBy: user?.id || null,
      },
    })
  }

  // Phase 2 查询：故障与事件

  async listIncidents(user: { role?: string; organizationId?: string | null }, status = 'open') {
    const orgWhere = user.role === UserRole.SUPER_ADMIN ? {} : { organizationId: user.organizationId || null }
    const where: any = { ...orgWhere }
    if (status && status !== 'all') where.status = status
    return this.prisma.companionIncident.findMany({
      where,
      orderBy: { lastOccurredAt: 'desc' },
      take: 200,
    })
  }

  async listEvents(user: { role?: string; organizationId?: string | null }, deviceId?: string, take = 100) {
    const orgWhere = user.role === UserRole.SUPER_ADMIN ? {} : { organizationId: user.organizationId || null }
    const where: any = { ...orgWhere }
    if (deviceId) where.deviceId = deviceId
    return this.prisma.companionEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, Math.max(1, Number(take) || 100)),
    })
  }
}
