import { BadRequestException } from '@nestjs/common'
import { PerformanceLadderService } from '../../src/modules/performance-ladder/performance-ladder.service'

/** 固定“当前月”为 2026-09，保证测试不依赖真实时钟 */
class FixedMonthService extends PerformanceLadderService {
  protected currentYearMonth(): string {
    return '2026-09'
  }
}

function createPrismaMock() {
  const teacherLuhui = {
    id: 't1',
    name: '卢慧',
    aliases: JSON.stringify(['卢慧', '高维破局']),
    monthlyTarget: 1600,
    enabled: true,
    sortOrder: 0,
    createdAt: new Date('2026-08-15T00:00:00.000Z'),
  }
  const teacherNew = {
    id: 't2',
    name: '新老师',
    aliases: JSON.stringify([]),
    monthlyTarget: 800,
    enabled: true,
    sortOrder: 1,
    createdAt: new Date('2026-09-10T00:00:00.000Z'),
  }
  const config = {
    id: 'cfg1',
    organizationId: 'org1',
    sourceOperators: JSON.stringify({ 'a-key': '运营A' }),
    hideUnmatched: true,
  }
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', organizationId: 'org1', name: 'Tester' }) },
    performanceLadderConfig: { findUnique: jest.fn().mockResolvedValue(config) },
    performanceLadderTeacher: {
      findMany: jest.fn().mockResolvedValue([teacherLuhui, teacherNew]),
      findFirst: jest.fn().mockResolvedValue({ id: 't1' }),
      update: jest.fn().mockImplementation(() => {
        // 模拟真实数据库：更新后同一对象引用反映新值
        teacherLuhui.monthlyTarget = 2000
        return Promise.resolve(teacherLuhui)
      }),
      delete: jest.fn().mockResolvedValue({}),
    },
    performanceLadderMonthSnapshot: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((args: any) =>
        Promise.resolve({
          id: 'snap1',
          ...args.data,
          capturedAt: args.data.capturedAt,
        }),
      ),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  }
  return { prisma, teacherLuhui, teacherNew, config }
}

function createService(prisma: any) {
  const permissionService = { assertUserPermission: jest.fn().mockResolvedValue(undefined) }
  return new FixedMonthService(prisma, permissionService as any)
}

describe('PerformanceLadderService.getMonthSnapshot', () => {
  it('拒绝非法月份格式', async () => {
    const { prisma } = createPrismaMock()
    const service = createService(prisma)
    await expect(service.getMonthSnapshot('u1', '2026/09')).rejects.toThrow(BadRequestException)
    await expect(service.getMonthSnapshot('u1', '26-09')).rejects.toThrow(BadRequestException)
  })

  it('拒绝未来月份', async () => {
    const { prisma } = createPrismaMock()
    const service = createService(prisma)
    await expect(service.getMonthSnapshot('u1', '2026-10')).rejects.toThrow(BadRequestException)
  })

  it('当前月返回实时配置，不读快照表', async () => {
    const { prisma } = createPrismaMock()
    const service = createService(prisma)
    const res = await service.getMonthSnapshot('u1', '2026-09')
    expect(res.isCurrentMonth).toBe(true)
    expect(res.snapshotCreated).toBe(false)
    expect(res.capturedAt).toBeNull()
    expect(res.targets).toHaveLength(2)
    expect(res.targets[0].name).toBe('卢慧')
    expect(res.sourceOperators).toEqual({ 'a-key': '运营A' })
    expect(prisma.performanceLadderMonthSnapshot.findUnique).not.toHaveBeenCalled()
  })

  it('历史月已有快照时直接返回冻结数据，不重新创建', async () => {
    const { prisma } = createPrismaMock()
    const frozen = {
      yearMonth: '2026-08',
      targets: JSON.stringify([{ id: 't1', name: '卢慧', aliases: ['卢慧'], monthlyTarget: 1260 }]),
      sourceOperators: JSON.stringify({ 'a-key': '运营A' }),
      hideUnmatched: false,
      capturedAt: new Date('2026-08-31T10:00:00.000Z'),
    }
    prisma.performanceLadderMonthSnapshot.findUnique.mockResolvedValue(frozen)
    const service = createService(prisma)
    const res = await service.getMonthSnapshot('u1', '2026-08')
    expect(res.isCurrentMonth).toBe(false)
    expect(res.snapshotCreated).toBe(false)
    expect(res.hideUnmatched).toBe(false)
    expect(res.targets[0].monthlyTarget).toBe(1260)
    expect(prisma.performanceLadderMonthSnapshot.create).not.toHaveBeenCalled()
  })

  it('历史月首次查看时创建快照，且排除该月结束后才创建的老师', async () => {
    const { prisma, teacherNew } = createPrismaMock()
    prisma.performanceLadderMonthSnapshot.findUnique.mockResolvedValue(null)
    const service = createService(prisma)
    const res = await service.getMonthSnapshot('u1', '2026-08')
    expect(res.isCurrentMonth).toBe(false)
    expect(res.snapshotCreated).toBe(true)
    expect(res.targets).toHaveLength(1)
    expect(res.targets[0].id).toBe('t1')
    expect(prisma.performanceLadderMonthSnapshot.create).toHaveBeenCalledTimes(1)
    const createdTargets = JSON.parse(
      prisma.performanceLadderMonthSnapshot.create.mock.calls[0][0].data.targets,
    )
    expect(createdTargets.map((item: any) => item.id)).not.toContain(teacherNew.id)
  })

  it('历史月第二次查看复用已创建快照', async () => {
    const { prisma } = createPrismaMock()
    const service = createService(prisma)
    await service.getMonthSnapshot('u1', '2026-07')
    // 第二次调用时 findUnique 返回已落库的快照
    prisma.performanceLadderMonthSnapshot.findUnique.mockImplementation((args: any) => {
      const data = prisma.performanceLadderMonthSnapshot.create.mock.calls[0][0].data
      return Promise.resolve({ ...data, id: 'snap1', yearMonth: args.where.organizationId_yearMonth.yearMonth })
    })
    const res = await service.getMonthSnapshot('u1', '2026-07')
    expect(res.snapshotCreated).toBe(false)
    expect(prisma.performanceLadderMonthSnapshot.create).toHaveBeenCalledTimes(1)
  })

  it('跨年历史月可读取（2026-01 → 2025-12）', async () => {
    const { prisma } = createPrismaMock()
    prisma.performanceLadderMonthSnapshot.findUnique.mockResolvedValue({
      yearMonth: '2025-12',
      targets: JSON.stringify([{ id: 't1', name: '卢慧', aliases: ['卢慧'], monthlyTarget: 1000 }]),
      sourceOperators: JSON.stringify({}),
      hideUnmatched: true,
      capturedAt: new Date('2025-12-31T10:00:00.000Z'),
    })
    const service = createService(prisma)
    const res = await service.getMonthSnapshot('u1', '2025-12')
    expect(res.yearMonth).toBe('2025-12')
    expect(res.targets[0].monthlyTarget).toBe(1000)
  })

  it('两个标签页同时首次打开同一历史月：P2002 竞态回退为读取已创建快照', async () => {
    const { prisma } = createPrismaMock()
    prisma.performanceLadderMonthSnapshot.findUnique.mockResolvedValue(null)
    // 第一次查询不存在，创建时另一请求已先写入 → 唯一约束冲突
    prisma.performanceLadderMonthSnapshot.create.mockRejectedValue({ code: 'P2002' })
    // 冲突后重读：返回另一请求刚写入的快照
    const raced = {
      yearMonth: '2026-08',
      targets: JSON.stringify([{ id: 't1', name: '卢慧', aliases: ['卢慧'], monthlyTarget: 1260 }]),
      sourceOperators: JSON.stringify({}),
      hideUnmatched: true,
      capturedAt: new Date('2026-09-01T03:00:00.000Z'),
    }
    // 第一次查询不存在（触发创建）→ P2002 → 第二次重读返回另一请求刚写入的快照
    let reads = 0
    prisma.performanceLadderMonthSnapshot.findUnique.mockImplementation(() => {
      reads += 1
      return Promise.resolve(reads >= 2 ? raced : null)
    })
    const service = createService(prisma)
    const res = await service.getMonthSnapshot('u1', '2026-08')
    expect(res.snapshotCreated).toBe(false)
    expect(res.targets[0].name).toBe('卢慧')
    expect(res.targets[0].monthlyTarget).toBe(1260)
  })

  it('P2002 竞态且重读不到快照时原样抛错', async () => {
    const { prisma } = createPrismaMock()
    prisma.performanceLadderMonthSnapshot.findUnique.mockResolvedValue(null)
    prisma.performanceLadderMonthSnapshot.create.mockRejectedValue({ code: 'P2002' })
    const service = createService(prisma)
    await expect(service.getMonthSnapshot('u1', '2026-08')).rejects.toEqual({ code: 'P2002' })
  })
})

describe('PerformanceLadderService 快照捕获', () => {
  it('更新老师目标后，当前月快照被 upsert', async () => {
    const { prisma } = createPrismaMock()
    const service = createService(prisma)
    await service.updateTeacher('u1', 't1', { monthlyTarget: 2000 })
    expect(prisma.performanceLadderMonthSnapshot.upsert).toHaveBeenCalledTimes(1)
    const args = prisma.performanceLadderMonthSnapshot.upsert.mock.calls[0][0]
    expect(args.where.organizationId_yearMonth).toEqual({ organizationId: 'org1', yearMonth: '2026-09' })
    const updateTargets = JSON.parse(args.update.targets)
    expect(updateTargets.map((item: any) => item.monthlyTarget)).toContain(2000)
  })

  it('无配置且无老师时不创建快照', async () => {
    const { prisma } = createPrismaMock()
    prisma.performanceLadderConfig.findUnique.mockResolvedValue(null)
    prisma.performanceLadderTeacher.findMany.mockResolvedValue([])
    const service = createService(prisma)
    await service.getMonthSnapshot('u1', '2026-08')
    expect(prisma.performanceLadderMonthSnapshot.create).not.toHaveBeenCalled()
  })

  it('当月快照 upsert 遇到 P2002 竞态时回退为 update', async () => {
    const { prisma } = createPrismaMock()
    prisma.performanceLadderMonthSnapshot.upsert.mockRejectedValue({ code: 'P2002' })
    const service = createService(prisma)
    await service.updateTeacher('u1', 't1', { monthlyTarget: 2000 })
    expect(prisma.performanceLadderMonthSnapshot.update).toHaveBeenCalledTimes(1)
    const updateArgs = prisma.performanceLadderMonthSnapshot.update.mock.calls[0][0]
    expect(updateArgs.where.organizationId_yearMonth).toEqual({
      organizationId: 'org1',
      yearMonth: '2026-09',
    })
    expect(JSON.parse(updateArgs.data.targets).map((item: any) => item.monthlyTarget)).toContain(2000)
  })
})
