/**
 * SystemHealthService 单元测试（统一系统健康中心 Phase 1）
 * 覆盖：前端事件脱敏、后端 HTTP 事件分级、5xx 去重聚合、
 * 恢复巡检（OPEN→RECOVERING→RESOLVED）、确认不改状态、COMPANION 不在巡检范围。
 */

import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { SystemHealthService } from '../../src/modules/system-health/system-health.service'
import { PrismaService } from '../../src/prisma/prisma.service'
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock'

const adminUser = { id: 'user-1', role: 'SUPER_ADMIN', organizationId: null }

function inc(overrides: Record<string, any> = {}) {
  return {
    id: 'inc-1',
    sourceType: 'BACKEND',
    scope: 'GET /orders',
    organizationId: null,
    errorCode: 'HttpException',
    severity: 'ERROR',
    status: 'OPEN',
    firstOccurredAt: new Date('2026-08-31T00:00:00Z'),
    lastOccurredAt: new Date('2026-08-31T00:05:00Z'),
    recoveryStartedAt: null,
    resolvedAt: null,
    occurrenceCount: 3,
    affectedUsers: 0,
    affectedDevices: 0,
    affectedAccounts: 0,
    affectedStores: 0,
    affectedVersions: null,
    title: '后端接口异常',
    summary: 'summary',
    rootCause: null,
    resolution: null,
    acknowledgedAt: null,
    acknowledgedBy: null,
    dedupeKey: 'BACKEND|GET /orders|HttpException',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('SystemHealthService', () => {
  let service: SystemHealthService

  beforeEach(async () => {
    resetPrismaMocks()
    const module: TestingModule = await Test.createTestingModule({
      providers: [SystemHealthService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile()
    service = module.get(SystemHealthService)
  })

  describe('recordBackendHttpEvent', () => {
    it('忽略正常快速请求（不写事件）', async () => {
      await service.recordBackendHttpEvent({
        requestId: 'r1',
        method: 'GET',
        url: '/api/v1/orders',
        statusCode: 200,
        durationMs: 50,
      })
      expect(mockPrismaService.systemEvent.create).not.toHaveBeenCalled()
      expect(mockPrismaService.systemIncident.create).not.toHaveBeenCalled()
    })

    it('5xx 写入 BACKEND 事件并生成 OPEN 故障，重复发生聚合 occurrenceCount', async () => {
      mockPrismaService.systemIncident.findFirst.mockResolvedValue(null)
      mockPrismaService.systemIncident.create.mockResolvedValue(inc())
      await service.recordBackendHttpEvent({
        requestId: 'r1',
        method: 'GET',
        url: '/api/v1/orders/12345678901234567',
        statusCode: 500,
        durationMs: 200,
        errorName: 'HttpException',
        errorMessage: 'boom',
      })
      const eventArg = mockPrismaService.systemEvent.create.mock.calls[0][0]
      expect(eventArg.data.sourceType).toBe('BACKEND')
      expect(eventArg.data.severity).toBe('ERROR')
      expect(eventArg.data.eventType).toBe('HTTP_5XX')
      expect(eventArg.data.requestId).toBe('r1')
      expect(eventArg.data.sourceId).toContain('/:id')
      expect(mockPrismaService.systemIncident.create).toHaveBeenCalled()

      const existing = inc()
      mockPrismaService.systemIncident.findFirst.mockResolvedValue(existing)
      mockPrismaService.systemIncident.update.mockResolvedValue({})
      await service.recordBackendHttpEvent({
        requestId: 'r2',
        method: 'GET',
        url: '/api/v1/orders/12345678901234567',
        statusCode: 500,
        durationMs: 300,
        errorName: 'HttpException',
      })
      const updateArg = mockPrismaService.systemIncident.update.mock.calls[0][0]
      expect(updateArg.data.occurrenceCount).toBe(existing.occurrenceCount + 1)
      expect(updateArg.data.status).toBe('OPEN')
      expect(updateArg.data.recoveryStartedAt).toBeNull()
    })

    it('Prisma 异常归入 DATABASE 来源', async () => {
      mockPrismaService.systemIncident.findFirst.mockResolvedValue(null)
      mockPrismaService.systemIncident.create.mockResolvedValue(inc())
      await service.recordBackendHttpEvent({
        requestId: 'r6',
        method: 'POST',
        url: '/api/v1/orders',
        statusCode: 500,
        durationMs: 100,
        errorName: 'PrismaClientKnownRequestError',
      })
      const arg = mockPrismaService.systemEvent.create.mock.calls[0][0]
      expect(arg.data.sourceType).toBe('DATABASE')
    })

    it('4xx 与 1~3 秒慢请求为 WARNING，3 秒以上为 HTTP_SLOW', async () => {
      await service.recordBackendHttpEvent({
        requestId: 'r3',
        method: 'GET',
        url: '/api/v1/orders',
        statusCode: 404,
        durationMs: 80,
      })
      const first = mockPrismaService.systemEvent.create.mock.calls[0][0]
      expect(first.data.severity).toBe('WARNING')
      expect(first.data.eventType).toBe('HTTP_4XX')

      mockPrismaService.systemEvent.create.mockClear()
      await service.recordBackendHttpEvent({
        requestId: 'r4',
        method: 'GET',
        url: '/api/v1/orders',
        statusCode: 200,
        durationMs: 1500,
      })
      const second = mockPrismaService.systemEvent.create.mock.calls[0][0]
      expect(second.data.severity).toBe('WARNING')
      expect(second.data.eventType).toBe('HTTP_LATENCY')

      mockPrismaService.systemEvent.create.mockClear()
      await service.recordBackendHttpEvent({
        requestId: 'r5',
        method: 'GET',
        url: '/api/v1/orders',
        statusCode: 200,
        durationMs: 3500,
      })
      const third = mockPrismaService.systemEvent.create.mock.calls[0][0]
      expect(third.data.severity).toBe('WARNING')
      expect(third.data.eventType).toBe('HTTP_SLOW')
    })
  })

  describe('recordFrontendEvent', () => {
    it('脱敏 token/password 并生成 FRONTEND 事件与故障', async () => {
      mockPrismaService.systemIncident.findFirst.mockResolvedValue(null)
      mockPrismaService.systemIncident.create.mockResolvedValue(inc())
      await service.recordFrontendEvent(adminUser, {
        eventType: 'JS_ERROR',
        severity: 'ERROR',
        message: 'boom token=abc123 password=secret',
        route: '/dashboard?token=xyz',
        requestId: 'req-front-1',
        occurredAt: new Date().toISOString(),
      })
      const arg = mockPrismaService.systemEvent.create.mock.calls[0][0]
      expect(arg.data.sourceType).toBe('FRONTEND')
      expect(arg.data.severity).toBe('ERROR')
      expect(arg.data.message).not.toContain('abc123')
      expect(arg.data.message).not.toContain('secret')
      expect(arg.data.sourceId).toBe('/dashboard')
      expect(mockPrismaService.systemIncident.create).toHaveBeenCalled()
    })

    it('WARNING 事件不生成故障', async () => {
      await service.recordFrontendEvent(adminUser, {
        eventType: 'RESOURCE_ERROR',
        severity: 'WARNING',
        message: 'img fail',
        route: '/dashboard',
      })
      expect(mockPrismaService.systemEvent.create).toHaveBeenCalled()
      expect(mockPrismaService.systemIncident.create).not.toHaveBeenCalled()
    })

    it('忽略 ResizeObserver 浏览器噪音，不写入事件或故障', async () => {
      const result = await service.recordFrontendEvent(adminUser, {
        eventType: 'JS_ERROR',
        severity: 'ERROR',
        message: 'ResizeObserver loop completed with undelivered notifications.',
      })

      expect(result).toEqual({ accepted: true, ignored: true })
      expect(mockPrismaService.systemEvent.create).not.toHaveBeenCalled()
      expect(mockPrismaService.systemIncident.create).not.toHaveBeenCalled()
    })
  })

  describe('sweepIncidentRecovery', () => {
    beforeEach(() => {
      mockPrismaService.systemIncident.updateMany.mockResolvedValue({ count: 0 })
    })

    it('OPEN 静默超过阈值 → RECOVERING，且只覆盖自动采集来源', async () => {
      mockPrismaService.systemIncident.updateMany.mockResolvedValue({ count: 1 })
      await service.sweepIncidentRecovery()
      const recoveringCall = mockPrismaService.systemIncident.updateMany.mock.calls.find(
        (call: any[]) => call[0].data.status === 'RECOVERING',
      )
      expect(recoveringCall).toBeTruthy()
      expect(recoveringCall[0].where.sourceType.in).toEqual([
        'FRONTEND',
        'BACKEND',
        'DATABASE',
        'BUSINESS',
      ])
      expect(recoveringCall[0].where.status).toBe('OPEN')
      expect(recoveringCall[0].data.recoveryStartedAt).toBeInstanceOf(Date)
    })

    it('RECOVERING 持续静默 → RESOLVED，COMPANION 不在巡检范围', async () => {
      mockPrismaService.systemIncident.updateMany.mockResolvedValue({ count: 1 })
      await service.sweepIncidentRecovery()
      const resolvedCall = mockPrismaService.systemIncident.updateMany.mock.calls.find(
        (call: any[]) => call[0].data.status === 'RESOLVED',
      )
      expect(resolvedCall).toBeTruthy()
      expect(resolvedCall[0].data.resolvedAt).toBeInstanceOf(Date)
      expect(resolvedCall[0].where.sourceType.in).not.toContain('COMPANION')
    })

    it('巡检异常被吞掉，不影响调用方', async () => {
      mockPrismaService.systemIncident.updateMany.mockRejectedValue(new Error('db down'))
      await expect(service.sweepIncidentRecovery()).resolves.toBeUndefined()
    })
  })

  describe('acknowledgeIncident', () => {
    it('确认只写 acknowledgedAt/acknowledgedBy，不改变 status', async () => {
      mockPrismaService.systemIncident.findFirst.mockResolvedValue(inc())
      mockPrismaService.systemIncident.update.mockResolvedValue(inc({ acknowledgedAt: new Date() }))
      await service.acknowledgeIncident(adminUser, 'inc-1')
      const updateArg = mockPrismaService.systemIncident.update.mock.calls[0][0]
      expect(updateArg.data.acknowledgedAt).toBeInstanceOf(Date)
      expect(updateArg.data.acknowledgedBy).toBe('user-1')
      expect(updateArg.data.status).toBeUndefined()
    })

    it('找不到故障时抛出 404', async () => {
      mockPrismaService.systemIncident.findFirst.mockResolvedValue(null)
      await expect(service.acknowledgeIncident(adminUser, 'inc-other')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('严重度只升不降', () => {
    it('CRITICAL 故障收到 ERROR 事件时保持 CRITICAL', async () => {
      mockPrismaService.systemIncident.findFirst.mockResolvedValue(inc({ severity: 'CRITICAL' }))
      mockPrismaService.systemIncident.update.mockResolvedValue({})
      await service.recordBackendHttpEvent({
        requestId: 'r7',
        method: 'GET',
        url: '/api/v1/orders',
        statusCode: 500,
        durationMs: 200,
        errorName: 'HttpException',
      })
      const updateArg = mockPrismaService.systemIncident.update.mock.calls[0][0]
      expect(updateArg.data.severity).toBe('CRITICAL')
    })

    it('WARNING 故障收到 ERROR 事件时升级为 ERROR', async () => {
      mockPrismaService.systemIncident.findFirst.mockResolvedValue(inc({ severity: 'WARNING' }))
      mockPrismaService.systemIncident.update.mockResolvedValue({})
      await service.recordBackendHttpEvent({
        requestId: 'r8',
        method: 'GET',
        url: '/api/v1/orders',
        statusCode: 500,
        durationMs: 200,
        errorName: 'HttpException',
      })
      const updateArg = mockPrismaService.systemIncident.update.mock.calls[0][0]
      expect(updateArg.data.severity).toBe('ERROR')
    })
  })

  describe('前端事件时间戳钳制', () => {
    it('未来时间戳回落到服务器当前时间', async () => {
      await service.recordFrontendEvent(adminUser, {
        eventType: 'JS_ERROR',
        severity: 'WARNING',
        message: 'future timestamp',
        route: '/dashboard',
        occurredAt: '2099-01-01T00:00:00Z',
      })
      const arg = mockPrismaService.systemEvent.create.mock.calls[0][0]
      const recorded = new Date(arg.data.occurredAt)
      expect(Math.abs(Date.now() - recorded.getTime())).toBeLessThan(60_000)
    })

    it('超过 7 天的历史时间戳回落到服务器当前时间', async () => {
      await service.recordFrontendEvent(adminUser, {
        eventType: 'JS_ERROR',
        severity: 'WARNING',
        message: 'ancient timestamp',
        route: '/dashboard',
        occurredAt: '2020-01-01T00:00:00Z',
      })
      const arg = mockPrismaService.systemEvent.create.mock.calls[0][0]
      const recorded = new Date(arg.data.occurredAt)
      expect(Math.abs(Date.now() - recorded.getTime())).toBeLessThan(60_000)
    })
  })

  describe('伴侣故障同步去重（串行化防竞态）', () => {
    it('并发同步只创建一次故障，第二次走更新路径', async () => {
      const companionIncident = {
        id: 'cinc-1',
        deviceId: 'device-1',
        type: 'SYNC_FAIL_3X',
        message: '连续同步失败',
        status: 'open',
        occurrences: 3,
        firstOccurredAt: new Date('2026-09-01T00:00:00Z'),
        lastOccurredAt: new Date('2026-09-01T00:05:00Z'),
        recoveringSince: null,
        resolvedAt: null,
        durationSeconds: null,
        organizationId: null,
      }
      mockPrismaService.companionIncident.findMany.mockResolvedValue([companionIncident])
      let created = false
      const createdRow = inc({ dedupeKey: 'COMPANION|default|device-1|SYNC_FAIL_3X' })
      mockPrismaService.systemIncident.findFirst.mockImplementation(async () => (created ? createdRow : null))
      mockPrismaService.systemIncident.create.mockImplementation(async () => {
        created = true
        return createdRow
      })
      mockPrismaService.systemIncident.update.mockResolvedValue(createdRow)

      const svc = service as any
      await Promise.all([
        svc.syncCompanionIncidents(adminUser),
        svc.syncCompanionIncidents(adminUser),
      ])
      expect(mockPrismaService.systemIncident.create).toHaveBeenCalledTimes(1)
      expect(mockPrismaService.systemIncident.update).toHaveBeenCalledTimes(1)
    })
  })

  describe('getOverview 计数', () => {
    function setupOverview(overrides: { critical?: number; error?: number; unresolved?: number; frontendErrors?: number; dbOk?: boolean } = {}) {
      mockPrismaService.systemEvent.count.mockResolvedValue(overrides.frontendErrors ?? 0)
      mockPrismaService.companionDevice.findMany.mockResolvedValue([])
      mockPrismaService.companionIncident.findMany.mockResolvedValue([])
      mockPrismaService.companionIncident.count.mockResolvedValue(0)
      mockPrismaService.systemIncident.findMany.mockResolvedValue([])
      // count 调用顺序：RECOVERING / todayResolved / unresolved / CRITICAL / ERROR
      mockPrismaService.systemIncident.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(overrides.unresolved ?? 0)
        .mockResolvedValueOnce(overrides.critical ?? 0)
        .mockResolvedValueOnce(overrides.error ?? 0)
      mockPrismaService.$queryRaw.mockResolvedValue(overrides.dbOk === false ? Promise.reject(new Error('db down')) : [])
    }

    it('P0/P1/未解决取真实计数而不是 Top8 截断列表', async () => {
      setupOverview({ critical: 1, error: 9, unresolved: 20, frontendErrors: 0, dbOk: true })
      const overview = await service.getOverview(adminUser)
      expect(overview.counters.p0).toBe(1)
      expect(overview.counters.p1).toBe(9)
      expect(overview.counters.unresolvedIncidents).toBe(20)
      expect(overview.overallStatus).toBe('CRITICAL')
    })

    it('数据库异常 → CRITICAL；只有 P1 → INCIDENT；无未解决但有前端错误 → DEGRADED', async () => {
      setupOverview({ critical: 0, error: 0, unresolved: 0, frontendErrors: 0, dbOk: false })
      expect((await service.getOverview(adminUser)).overallStatus).toBe('CRITICAL')

      setupOverview({ critical: 0, error: 3, unresolved: 3, frontendErrors: 0, dbOk: true })
      expect((await service.getOverview(adminUser)).overallStatus).toBe('INCIDENT')

      setupOverview({ critical: 0, error: 0, unresolved: 0, frontendErrors: 5, dbOk: true })
      expect((await service.getOverview(adminUser)).overallStatus).toBe('DEGRADED')
    })

    it('尚未执行采集不计为失败，且异常设备数与故障条数分开统计', async () => {
      setupOverview({ critical: 0, error: 0, unresolved: 0, frontendErrors: 0, dbOk: true })
      mockPrismaService.companionDevice.findMany.mockResolvedValue([
        {
          healthStatus: 'online',
          consecutiveSyncFailures: 0,
          lastCollectionSuccess: false,
          lastCollectionAt: null,
          lastSyncSuccess: null,
          lastSyncAt: null,
        },
      ])
      mockPrismaService.companionIncident.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { deviceId: 'device-1', organizationId: null },
          { deviceId: 'device-1', organizationId: null },
          { deviceId: 'device-2', organizationId: null },
        ])

      const overview = await service.getOverview(adminUser)
      expect(overview.cards.companion.failedCollectOrSync).toBe(0)
      expect(overview.cards.companion.anomalies).toBe(2)
      expect(overview.cards.companion.activeIncidents).toBe(3)
      expect(overview.counters.companionAnomalies).toBe(2)
      expect(overview.counters.companionActiveIncidents).toBe(3)
    })

    it('已恢复的前端错误只保留为24小时趋势，不继续把卡片标成降级', async () => {
      setupOverview({ critical: 0, error: 0, unresolved: 0, frontendErrors: 3, dbOk: true })
      mockPrismaService.systemIncident.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const overview = await service.getOverview(adminUser)
      expect(overview.cards.frontend.status).toBe('HEALTHY')
      expect(overview.cards.frontend.errors24h).toBe(3)
      expect(overview.cards.frontend.activeIncidents).toBe(0)
    })
  })
})
