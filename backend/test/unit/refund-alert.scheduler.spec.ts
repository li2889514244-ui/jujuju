import { RefundAlertScheduler } from '../../src/modules/scheduler/refund-alert.scheduler'

describe('RefundAlertScheduler', () => {
  function createHarness() {
    const prisma: any = {
      wechatStoreAftersale: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      wechatStore: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      doudianStoreAftersale: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      doudianStore: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'admin-1' }]),
      },
      notification: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    }
    const notificationsService = {
      create: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    }
    const scheduler = new RefundAlertScheduler(prisma, notificationsService as any) as any
    scheduler.lastCheckAt = new Date('2026-07-29T00:00:00.000Z')

    return { prisma, notificationsService, scheduler }
  }

  it('does not push doudian aftersales that are still processing', async () => {
    const { prisma, notificationsService, scheduler } = createHarness()
    prisma.doudianStoreAftersale.findMany.mockResolvedValue([
      {
        afterSaleId: 'after-1',
        storeId: 'store-1',
        orderId: 'order-1',
        type: 1,
        status: 6,
        amount: 29900,
        product: 'Course',
        createTime: 1,
        raw: {},
      },
    ])

    await scheduler.checkNewRefunds()

    expect(prisma.doudianStore.findMany).not.toHaveBeenCalled()
    expect(notificationsService.create).not.toHaveBeenCalled()
  })

  it('does not push historical successful refunds just because they were synced again', async () => {
    const { prisma, notificationsService, scheduler } = createHarness()
    prisma.doudianStoreAftersale.findMany.mockResolvedValue([
      {
        afterSaleId: 'old-after-1',
        storeId: 'store-1',
        orderId: 'order-1',
        type: 1,
        status: 12,
        amount: 29900,
        product: 'Course',
        createTime: 100,
        updateTime: 100,
        raw: {},
      },
    ])
    prisma.wechatStoreAftersale.findMany.mockResolvedValue([
      {
        afterSaleOrderId: 'old-after-2',
        storeId: 'wechat-1',
        type: '1',
        status: 'MERCHANT_REFUND_SUCCESS',
        amount: 29900,
        reason: '质量问题',
        product: 'Course',
        completeTime: 100,
        createTime: 100,
      },
    ])

    await scheduler.checkNewRefunds()

    expect(prisma.doudianStore.findMany).not.toHaveBeenCalled()
    expect(prisma.wechatStore.findMany).not.toHaveBeenCalled()
    expect(notificationsService.create).not.toHaveBeenCalled()
  })

  it('pushes a refund again after the previous notification has been read', async () => {
    const { prisma, notificationsService, scheduler } = createHarness()
    const freshTime = Math.floor(Date.now() / 1000)
    prisma.doudianStoreAftersale.findMany.mockResolvedValue([
      {
        afterSaleId: 'after-2',
        storeId: 'store-2',
        orderId: 'order-2',
        type: 1,
        status: 12,
        amount: 29900,
        product: 'Course',
        createTime: freshTime,
        updateTime: freshTime,
        raw: {},
      },
    ])
    prisma.doudianStore.findMany.mockResolvedValue([
      { id: 'store-2', name: 'Store Two', organizationId: 'org-1' },
    ])
    prisma.notification.findFirst.mockResolvedValue(null)

    await scheduler.checkNewRefunds()

    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'admin-1',
        type: 'REFUND_ALERT',
        organizationId: 'org-1',
        read: false,
        metadata: { contains: '"afterSaleId":"after-2"' },
      },
      select: { id: true },
    })
    expect(notificationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        organizationId: 'org-1',
        metadata: expect.objectContaining({ afterSaleId: 'after-2' }),
      }),
    )
  })

  it('creates inbox refund alerts for every admin but pushes Feishu only once', async () => {
    const { prisma, notificationsService, scheduler } = createHarness()
    const freshTime = Math.floor(Date.now() / 1000)
    prisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }])
    prisma.doudianStoreAftersale.findMany.mockResolvedValue([
      {
        afterSaleId: 'after-3',
        storeId: 'store-3',
        orderId: 'order-3',
        type: 1,
        status: 12,
        amount: 29900,
        product: 'Course',
        createTime: freshTime,
        updateTime: freshTime,
        raw: {},
      },
    ])
    prisma.doudianStore.findMany.mockResolvedValue([
      { id: 'store-3', name: 'Store Three', organizationId: 'org-1' },
    ])
    prisma.notification.findFirst.mockResolvedValue(null)

    await scheduler.checkNewRefunds()

    expect(notificationsService.create).toHaveBeenCalledTimes(2)
    expect(notificationsService.create.mock.calls[0][0]).toEqual(
      expect.objectContaining({ userId: 'admin-1', pushFeishu: true }),
    )
    expect(notificationsService.create.mock.calls[1][0]).toEqual(
      expect.objectContaining({ userId: 'admin-2', pushFeishu: false }),
    )
  })
})
