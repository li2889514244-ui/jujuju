/**
 * CompanionMonitorService 单元测试（Phase 1 + Phase 2）
 * Phase 2 覆盖：bootId/seq 防旧心跳覆盖、崩溃检测、优雅退出信标、
 * Event/Incident 聚合与生命周期（open->recovering->resolved、自动关闭）、
 * TASK_STUCK 无进展判定（有进度不告警）、incidents/events 查询。
 */

import { Test, TestingModule } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { CompanionMonitorService } from '../../src/modules/companion-monitor/companion-monitor.service'
import { PrismaService } from '../../src/prisma/prisma.service'
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock'

const baseDevice = (overrides: Record<string, any> = {}) => ({
  id: 'dev-id-1',
  deviceId: 'device-0000000001',
  deviceName: '测试机',
  ownerUserId: 'user-1',
  ownerName: 'tester',
  organizationId: 'default-tenant',
  companionVersion: '3.2.102',
  startedAt: new Date('2026-08-26T00:00:00Z'),
  firstSeenAt: new Date('2026-08-26T00:00:00Z'),
  lastSeenAt: new Date(),
  lastHeartbeatAt: new Date(),
  healthStatus: 'online',
  currentTask: 'idle',
  currentTaskDetail: {},
  taskStartedAt: null,
  platformSummary: {},
  lastCollectionAt: null,
  lastCollectionSuccess: null,
  lastCollectionAccountCount: 0,
  lastSyncAt: null,
  lastSyncSuccess: null,
  lastSyncUploadCount: 0,
  lastSyncErrorCode: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  lastErrorAt: null,
  updateStatus: {},
  cpuPercent: 1.2,
  memoryMb: 120,
  processUptimeSeconds: 3600,
  consecutiveSyncFailures: 0,
  recentHttpErrors: {},
  bootId: 'boot-1',
  bootSeq: 5,
  bootCount: 2,
  exitState: null,
  uiMode: 'webview',
  startupDiagnostic: {},
  lastProgressAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const user = { id: 'user-1', name: 'tester', organizationId: 'default-tenant', role: 'ADMIN' }

const basePayload: Record<string, any> = {
  deviceId: 'device-0000000001',
  deviceName: '测试机',
  companionVersion: '3.2.102',
  startedAt: '2026-08-26T00:00:00Z',
  taskStatus: 'idle',
  platformSummary: { DOUYIN: { accountCount: 2, expiredCount: 0 } },
  lastCollection: {},
  lastSync: {},
  lastError: {},
  update: {},
  recentHttpErrors: {},
  resources: { cpuPercent: 1.2, memoryMb: 120, processUptimeSeconds: 3600 },
}

function setupEvalDevices(devices: any[]) {
  mockPrismaService.companionDevice.findMany.mockResolvedValue(devices)
  mockPrismaService.companionIncident.findMany.mockResolvedValue([])
  mockPrismaService.companionIncident.findFirst.mockResolvedValue(null)
  mockPrismaService.companionIncident.create.mockResolvedValue({ id: 'inc-new' })
  mockPrismaService.companionIncident.update.mockResolvedValue({ id: 'inc-1' })
  mockPrismaService.companionEvent.create.mockResolvedValue({ id: 'ev-1' })
  mockPrismaService.companionAlert.findFirst.mockResolvedValue(null)
  mockPrismaService.companionAlert.create.mockResolvedValue({ id: 'al-1' })
  mockPrismaService.companionAlert.updateMany.mockResolvedValue({ count: 0 })
  mockPrismaService.companionDevice.update.mockResolvedValue({})
}

describe('CompanionMonitorService', () => {
  let service: CompanionMonitorService

  beforeEach(async () => {
    resetPrismaMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanionMonitorService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile()

    service = module.get<CompanionMonitorService>(CompanionMonitorService)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('processHeartbeat Phase 1', () => {
    it('首次心跳应创建设备并写入历史', async () => {
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(null)
      mockPrismaService.companionDevice.upsert.mockResolvedValue(baseDevice())
      mockPrismaService.companionHeartbeat.findFirst.mockResolvedValue(null)

      await service.processHeartbeat(user, basePayload)

      const args = mockPrismaService.companionDevice.upsert.mock.calls[0][0]
      expect(args.where).toEqual({ deviceId: 'device-0000000001' })
      expect(args.create.deviceId).toBe('device-0000000001')
      expect(args.create.healthStatus).toBe('online')
      expect(args.create.bootCount).toBe(1)
      expect(mockPrismaService.companionHeartbeat.create).toHaveBeenCalledTimes(1)
    })

    it('非法 deviceId 应拒绝', async () => {
      await expect(service.processHeartbeat(user, { ...basePayload, deviceId: '短' })).rejects.toBeInstanceOf(
        ForbiddenException,
      )
      expect(mockPrismaService.companionDevice.upsert).not.toHaveBeenCalled()
    })

    it('同步失败应递增连续失败次数', async () => {
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(baseDevice({ consecutiveSyncFailures: 2 }))
      mockPrismaService.companionDevice.upsert.mockResolvedValue(baseDevice())
      mockPrismaService.companionHeartbeat.findFirst.mockResolvedValue(null)

      await service.processHeartbeat(user, { ...basePayload, lastSync: { success: false, errorCode: 'E_NETWORK' } })

      const args = mockPrismaService.companionDevice.upsert.mock.calls[0][0]
      expect(args.update.consecutiveSyncFailures).toBe(3)
    })

    it('同步成功后应清零连续失败次数', async () => {
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(baseDevice({ consecutiveSyncFailures: 2 }))
      mockPrismaService.companionDevice.upsert.mockResolvedValue(baseDevice())
      mockPrismaService.companionHeartbeat.findFirst.mockResolvedValue(null)

      await service.processHeartbeat(user, { ...basePayload, lastSync: { success: true, uploadCount: 5 } })

      const args = mockPrismaService.companionDevice.upsert.mock.calls[0][0]
      expect(args.update.consecutiveSyncFailures).toBe(0)
    })

    it('lastSync.success 为 null（尚无同步）时不应计入失败', async () => {
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(baseDevice({ consecutiveSyncFailures: 1 }))
      mockPrismaService.companionDevice.upsert.mockResolvedValue(baseDevice())
      mockPrismaService.companionHeartbeat.findFirst.mockResolvedValue(null)

      await service.processHeartbeat(user, { ...basePayload, lastSync: { success: null, uploadCount: 0 } })

      const args = mockPrismaService.companionDevice.upsert.mock.calls[0][0]
      expect(args.update.consecutiveSyncFailures).toBe(1)
    })

    it('状态无变化时5分钟内不重复写历史', async () => {
      const device = baseDevice()
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(device)
      mockPrismaService.companionDevice.upsert.mockResolvedValue(device)
      mockPrismaService.companionHeartbeat.findFirst.mockResolvedValue({
        receivedAt: new Date(Date.now() - 60 * 1000),
        taskStatus: 'idle',
        lastSync: {},
        lastError: {},
        bootId: 'boot-1',
      })

      await service.processHeartbeat(user, { ...basePayload, bootId: 'boot-1', seq: 6 })
      expect(mockPrismaService.companionHeartbeat.create).not.toHaveBeenCalled()
    })

    it('任务状态变化时应写历史', async () => {
      const device = baseDevice()
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(device)
      mockPrismaService.companionDevice.upsert.mockResolvedValue(device)
      mockPrismaService.companionHeartbeat.findFirst.mockResolvedValue({
        receivedAt: new Date(Date.now() - 60 * 1000),
        taskStatus: 'idle',
        lastSync: {},
        lastError: {},
        bootId: 'boot-1',
      })

      await service.processHeartbeat(user, { ...basePayload, bootId: 'boot-1', seq: 6, taskStatus: 'collecting' })
      expect(mockPrismaService.companionHeartbeat.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('processHeartbeat Phase 2: 防旧心跳覆盖 / 崩溃检测', () => {
    it('同一 bootId 且 seq 未递增 → 视为迟到旧心跳，不回写状态', async () => {
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(baseDevice({ bootId: 'boot-1', bootSeq: 5 }))

      const result = await service.processHeartbeat(user, { ...basePayload, bootId: 'boot-1', seq: 4 })

      expect(result.stale).toBe(true)
      expect(mockPrismaService.companionDevice.upsert).not.toHaveBeenCalled()
    })

    it('不同 bootId 且 startedAt 更早 → 上一个运行周期迟到的旧心跳，忽略', async () => {
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(
        baseDevice({ bootId: 'boot-1', bootSeq: 5, startedAt: new Date('2026-08-26T01:00:00Z') }),
      )

      const result = await service.processHeartbeat(user, {
        ...basePayload,
        bootId: 'boot-0',
        seq: 1,
        startedAt: '2026-08-26T00:00:00Z',
      })

      expect(result.stale).toBe(true)
      expect(mockPrismaService.companionDevice.upsert).not.toHaveBeenCalled()
    })

    it('新 boot 正常接收：bootCount 递增 + BOOT_STARTED 事件', async () => {
      const device = baseDevice({ bootId: 'boot-1', bootSeq: 5, bootCount: 2 })
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(device)
      mockPrismaService.companionDevice.upsert.mockResolvedValue(device)
      mockPrismaService.companionHeartbeat.findFirst.mockResolvedValue(null)

      await service.processHeartbeat(user, {
        ...basePayload,
        bootId: 'boot-2',
        seq: 1,
        startedAt: '2026-08-26T02:00:00Z',
      })

      const args = mockPrismaService.companionDevice.upsert.mock.calls[0][0]
      expect(args.update.bootId).toBe('boot-2')
      expect(args.update.bootSeq).toBe(1)
      expect(args.update.bootCount).toBe(3)
      const eventTypes = mockPrismaService.companionEvent.create.mock.calls.map((c: any[]) => c[0].data.type)
      expect(eventTypes).toContain('BOOT_STARTED')
    })

    it('上次运行未正常退出且心跳很近 → CRASH_SUSPECTED 故障', async () => {
      const device = baseDevice({
        bootId: 'boot-1',
        bootSeq: 5,
        bootCount: 2,
        exitState: null,
        startedAt: new Date(Date.now() - 2 * 60 * 1000),
        lastHeartbeatAt: new Date(Date.now() - 2 * 60 * 1000),
      })
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(device)
      mockPrismaService.companionDevice.upsert.mockResolvedValue(device)
      mockPrismaService.companionHeartbeat.findFirst.mockResolvedValue(null)
      mockPrismaService.companionIncident.findFirst.mockResolvedValue(null)
      mockPrismaService.companionIncident.create.mockResolvedValue({ id: 'inc-1' })
      mockPrismaService.companionAlert.findFirst.mockResolvedValue(null)
      mockPrismaService.companionAlert.create.mockResolvedValue({ id: 'al-1' })

      await service.processHeartbeat(user, { ...basePayload, bootId: 'boot-2', seq: 1, startedAt: new Date().toISOString() })

      const incidentTypes = mockPrismaService.companionIncident.create.mock.calls.map((c: any[]) => c[0].data.type)
      expect(incidentTypes).toContain('CRASH_SUSPECTED')
    })

    it('上次优雅退出（exitState=clean）→ 不产生 CRASH_SUSPECTED', async () => {
      const device = baseDevice({
        bootId: 'boot-1',
        bootSeq: 5,
        exitState: 'clean',
        startedAt: new Date(Date.now() - 2 * 60 * 1000),
        lastHeartbeatAt: new Date(Date.now() - 2 * 60 * 1000),
      })
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(device)
      mockPrismaService.companionDevice.upsert.mockResolvedValue(device)
      mockPrismaService.companionHeartbeat.findFirst.mockResolvedValue(null)

      await service.processHeartbeat(user, { ...basePayload, bootId: 'boot-2', seq: 1, startedAt: new Date().toISOString() })

      const incidentTypes = mockPrismaService.companionIncident.create.mock.calls.map((c: any[]) => c[0].data.type)
      expect(incidentTypes).not.toContain('CRASH_SUSPECTED')
    })

    it('优雅退出信标：exitState=clean 写入设备', async () => {
      const device = baseDevice()
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(device)
      mockPrismaService.companionDevice.upsert.mockResolvedValue(device)
      mockPrismaService.companionHeartbeat.findFirst.mockResolvedValue(null)

      await service.processHeartbeat(user, { ...basePayload, bootId: 'boot-1', seq: 6, exitState: 'clean' })

      const args = mockPrismaService.companionDevice.upsert.mock.calls[0][0]
      expect(args.update.exitState).toBe('clean')
    })
  })

  describe('listDevices', () => {
    it('超级管理员不受租户过滤', async () => {
      mockPrismaService.companionDevice.findMany.mockResolvedValue([baseDevice()])

      await service.listDevices({ role: 'SUPER_ADMIN', organizationId: null })

      expect(mockPrismaService.companionDevice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      )
    })

    it('普通管理员按组织过滤', async () => {
      mockPrismaService.companionDevice.findMany.mockResolvedValue([])

      await service.listDevices({ role: 'ADMIN', organizationId: 'org-a' })

      expect(mockPrismaService.companionDevice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-a' }) }),
      )
    })

    it('异常筛选应包含离线/不稳定/同步失败条件', async () => {
      mockPrismaService.companionDevice.findMany.mockResolvedValue([])

      await service.listDevices({ role: 'SUPER_ADMIN' }, 'abnormal')

      expect(mockPrismaService.companionDevice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ healthStatus: 'offline' }),
              expect.objectContaining({ consecutiveSyncFailures: { gte: 3 } }),
            ]),
          }),
        }),
      )
    })
  })

  describe('getDeviceHistory', () => {
    it('越权访问其他组织设备应拒绝', async () => {
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(baseDevice({ organizationId: 'org-other' }))

      await expect(
        service.getDeviceHistory({ role: 'ADMIN', organizationId: 'org-a' }, 'device-0000000001'),
      ).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('应返回心跳、告警与故障历史', async () => {
      mockPrismaService.companionDevice.findUnique.mockResolvedValue(baseDevice())
      mockPrismaService.companionHeartbeat.findMany.mockResolvedValue([{ id: 'hb-1' }])
      mockPrismaService.companionAlert.findMany.mockResolvedValue([{ id: 'al-1' }])
      mockPrismaService.companionIncident.findMany.mockResolvedValue([{ id: 'inc-1' }])

      const result = await service.getDeviceHistory(user, 'device-0000000001')

      expect(result.heartbeats).toHaveLength(1)
      expect(result.alerts).toHaveLength(1)
      expect(result.incidents).toHaveLength(1)
    })
  })

  describe('evaluateHealthAndAlerts: 故障聚合', () => {
    it('心跳超过5分钟 → 离线 + HEARTBEAT_STALE 故障与事件', async () => {
      const stale = baseDevice({ lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000) })
      setupEvalDevices([stale])

      await service.evaluateHealthAndAlerts()

      expect(mockPrismaService.companionDevice.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'dev-id-1' }, data: { healthStatus: 'offline' } }),
      )
      const types = mockPrismaService.companionIncident.create.mock.calls.map((c: any[]) => c[0].data.type)
      expect(types).toContain('HEARTBEAT_STALE')
      expect(mockPrismaService.companionEvent.create).toHaveBeenCalled()
    })

    it('同一故障持续发生 → 同一 Incident 只刷新状态，不按分钟累加次数', async () => {
      const stale = baseDevice({ lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000) })
      setupEvalDevices([stale])
      mockPrismaService.companionIncident.findFirst.mockResolvedValue({
        id: 'inc-1', status: 'open', occurrences: 2,
      })

      await service.evaluateHealthAndAlerts()

      expect(mockPrismaService.companionIncident.create).not.toHaveBeenCalled()
      expect(mockPrismaService.companionIncident.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inc-1' },
          data: expect.objectContaining({ status: 'open' }),
        }),
      )
      const updateArg = mockPrismaService.companionIncident.update.mock.calls[0][0]
      expect(updateArg.data.occurrences).toBeUndefined()
    })

    it('连续3次同步失败 → SYNC_FAIL_3X 故障', async () => {
      const device = baseDevice({ consecutiveSyncFailures: 3 })
      setupEvalDevices([device])

      await service.evaluateHealthAndAlerts()

      const types = mockPrismaService.companionIncident.create.mock.calls.map((c: any[]) => c[0].data.type)
      expect(types).toContain('SYNC_FAIL_3X')
    })
  })

  describe('evaluateHealthAndAlerts: TASK_STUCK 无进展判定', () => {
    it('任务长时间无进展 → TASK_STUCK 故障', async () => {
      const device = baseDevice({
        currentTask: 'collecting',
        taskStartedAt: new Date(Date.now() - 40 * 60 * 1000),
        lastProgressAt: new Date(Date.now() - 20 * 60 * 1000),
      })
      setupEvalDevices([device])

      await service.evaluateHealthAndAlerts()

      const types = mockPrismaService.companionIncident.create.mock.calls.map((c: any[]) => c[0].data.type)
      expect(types).toContain('TASK_STUCK')
    })

    it('任务运行很久但持续有进度 → 不告警', async () => {
      const device = baseDevice({
        currentTask: 'collecting',
        taskStartedAt: new Date(Date.now() - 60 * 60 * 1000),
        lastProgressAt: new Date(Date.now() - 1 * 60 * 1000),
      })
      setupEvalDevices([device])

      await service.evaluateHealthAndAlerts()

      const types = mockPrismaService.companionIncident.create.mock.calls.map((c: any[]) => c[0].data.type)
      expect(types).not.toContain('TASK_STUCK')
    })

    it('设备已离线时不再用旧任务状态触发 TASK_STUCK', async () => {
      const device = baseDevice({
        lastHeartbeatAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        currentTask: 'collecting',
        taskStartedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        lastProgressAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      })
      setupEvalDevices([device])

      await service.evaluateHealthAndAlerts()

      const types = mockPrismaService.companionIncident.create.mock.calls.map((c: any[]) => c[0].data.type)
      expect(types).not.toContain('TASK_STUCK')
    })
  })

  describe('evaluateHealthAndAlerts: 恢复闭环（RECOVERING / RESOLVED）', () => {
    it('故障不再发生 → open 转 recovering', async () => {
      const healthy = baseDevice()
      setupEvalDevices([healthy])
      mockPrismaService.companionIncident.findMany.mockResolvedValue([{
        id: 'inc-1', deviceId: 'device-0000000001', type: 'SYNC_FAIL_3X',
        organizationId: 'default-tenant', status: 'open', recoveringSince: null,
        firstOccurredAt: new Date(Date.now() - 60 * 60 * 1000),
      }])

      await service.evaluateHealthAndAlerts()

      expect(mockPrismaService.companionIncident.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inc-1' },
          data: expect.objectContaining({ status: 'recovering' }),
        }),
      )
    })

    it('recovering 超过2分钟无复发 → resolved + 时长 + 自动关闭告警', async () => {
      const healthy = baseDevice()
      setupEvalDevices([healthy])
      mockPrismaService.companionIncident.findMany.mockResolvedValue([{
        id: 'inc-1', deviceId: 'device-0000000001', type: 'SYNC_FAIL_3X',
        organizationId: 'default-tenant', status: 'recovering',
        recoveringSince: new Date(Date.now() - 3 * 60 * 1000),
        firstOccurredAt: new Date(Date.now() - 60 * 60 * 1000),
      }])

      await service.evaluateHealthAndAlerts()

      expect(mockPrismaService.companionIncident.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inc-1' },
          data: expect.objectContaining({ status: 'resolved', durationSeconds: expect.any(Number) }),
        }),
      )
      expect(mockPrismaService.companionAlert.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'resolved' } }),
      )
    })

    it('recovering 期间复发 → 回到 open 并计数', async () => {
      const stale = baseDevice({ lastHeartbeatAt: new Date(Date.now() - 10 * 60 * 1000) })
      setupEvalDevices([stale])
      mockPrismaService.companionIncident.findFirst.mockResolvedValue({
        id: 'inc-1', status: 'recovering', occurrences: 2,
      })

      await service.evaluateHealthAndAlerts()

      expect(mockPrismaService.companionIncident.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inc-1' },
          data: expect.objectContaining({ status: 'open', occurrences: 3, recoveringSince: null }),
        }),
      )
    })
  })

  describe('getOverview', () => {
    it('应统计正常/异常/离线/版本过旧', async () => {
      const devices = [
        baseDevice({ id: 'd1', healthStatus: 'online', companionVersion: '3.2.102', updateStatus: { latest: '3.2.102' } }),
        baseDevice({ id: 'd2', healthStatus: 'offline', companionVersion: '3.2.100', updateStatus: { latest: '3.2.102' } }),
        baseDevice({ id: 'd3', healthStatus: 'unstable', companionVersion: '3.2.102', updateStatus: {} }),
        baseDevice({ id: 'd4', healthStatus: 'online', companionVersion: '3.2.100', updateStatus: {} }),
      ]
      mockPrismaService.companionDevice.findMany.mockResolvedValue(devices)

      const result = await service.getOverview({ role: 'SUPER_ADMIN' })

      expect(result.counts).toEqual({ normal: 2, abnormal: 1, offline: 1, versionOutdated: 2 })
    })
  })

  describe('Phase 2 查询接口', () => {
    it('listIncidents 默认查 open，支持 all', async () => {
      mockPrismaService.companionIncident.findMany.mockResolvedValue([])

      await service.listIncidents({ role: 'SUPER_ADMIN' })
      expect(mockPrismaService.companionIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'open' } }),
      )

      await service.listIncidents({ role: 'SUPER_ADMIN' }, 'all')
      expect(mockPrismaService.companionIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      )
    })

    it('listEvents 支持按设备过滤', async () => {
      mockPrismaService.companionEvent.findMany.mockResolvedValue([])

      await service.listEvents({ role: 'SUPER_ADMIN' }, 'device-0000000001', 50)

      expect(mockPrismaService.companionEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deviceId: 'device-0000000001' }, take: 50 }),
      )
    })
  })

  describe('cleanupOldRecords', () => {
    it('应清理30天前心跳/事件/告警与已解决故障', async () => {
      mockPrismaService.companionHeartbeat.deleteMany.mockResolvedValue({ count: 5 })
      mockPrismaService.companionEvent.deleteMany.mockResolvedValue({ count: 3 })
      mockPrismaService.companionAlert.deleteMany.mockResolvedValue({ count: 2 })
      mockPrismaService.companionIncident.deleteMany.mockResolvedValue({ count: 1 })

      await service.cleanupOldRecords()

      expect(mockPrismaService.companionHeartbeat.deleteMany).toHaveBeenCalledTimes(1)
      expect(mockPrismaService.companionEvent.deleteMany).toHaveBeenCalledTimes(1)
      expect(mockPrismaService.companionAlert.deleteMany).toHaveBeenCalledTimes(1)
      expect(mockPrismaService.companionIncident.deleteMany).toHaveBeenCalledTimes(1)
    })
  })
})
