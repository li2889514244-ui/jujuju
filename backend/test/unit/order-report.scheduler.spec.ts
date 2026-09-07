import { OrderReportScheduler } from '../../src/modules/scheduler/order-report.scheduler'

describe('OrderReportScheduler', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  function createHarness() {
    const prisma: any = {
      wechatStore: {
        findMany: jest.fn().mockResolvedValue([{ id: 'wechat-1', name: 'Wechat Store' }]),
      },
      wechatStoreOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      wechatStoreAftersale: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      doudianStore: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      doudianStoreOrder: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      doudianStoreAftersale: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    }
    const notificationsService = {
      create: jest.fn(),
    }
    const wechatStoreService = {
      syncAllStores: jest.fn().mockResolvedValue({ skipped: false, total: 0, success: 0, failed: 0 }),
    }
    const doudianBrowserService = {
      syncAllStores: jest.fn().mockResolvedValue({ skipped: false, total: 0, success: 0, failed: 0 }),
    }
    const scheduler = new OrderReportScheduler(
      prisma,
      notificationsService as any,
      wechatStoreService as any,
      doudianBrowserService as any,
    ) as any

    return { prisma, notificationsService, scheduler, wechatStoreService, doudianBrowserService }
  }

  it('counts only WeChat refunds related to transaction orders in the report range', async () => {
    const { prisma, scheduler } = createHarness()
    prisma.wechatStoreOrder.findMany.mockResolvedValue([
      {
        orderId: 'order-in-range',
        status: 30,
        payAmount: 29900,
        raw: { order_detail: { price_info: { product_price: 29900 } } },
      },
    ])
    prisma.wechatStoreAftersale.findMany.mockResolvedValue([
      {
        status: 'MERCHANT_REFUND_SUCCESS',
        amount: 29900,
        raw: { order_info: { order_id: 'order-in-range' } },
      },
      {
        status: 'MERCHANT_REFUND_SUCCESS',
        amount: 19900,
        raw: { order_info: { order_id: 'old-order' } },
      },
    ])

    const summaries = await scheduler.collectWechatStoreSummaries(100, 200, 'org-1')

    expect(summaries).toEqual([
      {
        storeName: 'Wechat Store',
        totalOrderCount: 1,
        orderCount: 1,
        totalAmount: 29900,
        refundCount: 1,
        refundAmount: 29900,
        sources: [],
      },
    ])
  })

  it('uses the page source refund window for WeChat source annotations', async () => {
    const { prisma, scheduler } = createHarness()
    jest.spyOn(Date, 'now').mockReturnValue(300 * 1000)
    prisma.wechatStoreOrder.findMany.mockResolvedValue([
      {
        orderId: 'order-in-range',
        status: 30,
        payAmount: 29900,
        shipTime: 150,
        raw: {
          order_detail: {
            price_info: { product_price: 29900 },
            source_infos: [
              {
                account_type: '5',
                account_id: 'author-1',
                account_nickname: 'Author A',
                sale_channel: '100',
              },
            ],
          },
        },
      },
    ])
    prisma.wechatStoreAftersale.findMany
      .mockResolvedValueOnce([
        {
          status: 'MERCHANT_REFUND_SUCCESS',
          amount: 29900,
          raw: { order_info: { order_id: 'order-in-range' } },
        },
      ])
      .mockResolvedValueOnce([
        {
          status: 'MERCHANT_REFUND_SUCCESS',
          amount: 29900,
          raw: { order_info: { order_id: 'order-in-range' } },
        },
        {
          status: 'MERCHANT_REFUND_SUCCESS',
          amount: 6900,
          raw: { order_info: { order_id: 'order-in-range' } },
        },
      ])

    const summaries = await scheduler.collectWechatStoreSummaries(100, 200, 'org-1')

    expect(prisma.wechatStoreAftersale.findMany.mock.calls[1][0].where.createTime).toEqual({
      gte: 100,
      lte: 300,
    })
    expect(summaries[0]).toEqual(
      expect.objectContaining({
        refundCount: 1,
        refundAmount: 29900,
        sources: [
          expect.objectContaining({
            name: 'Author A',
            refundCount: 2,
            refundAmount: 36800,
          }),
        ],
      }),
    )
  })

  it('uses the shared Doudian author extraction for report source summaries', () => {
    const { scheduler } = createHarness()

    const sources = scheduler.buildDoudianSourceSummaries(
      'Doudian Store',
      [
        {
          order_id: 'order-1',
          status: 3,
          pay_amount: 29900,
          create_time: 150,
          raw: {
            nested: { 达人昵称: '卢慧家庭教育' },
            traffic_source: '精选联盟 / 直播',
          },
        },
      ],
      [],
      100,
      200,
    )

    expect(sources).toEqual([
      expect.objectContaining({
        name: '卢慧家庭教育',
        channel: '精选联盟 / 直播',
        orderCount: 1,
        totalAmount: 29900,
      }),
    ])
  })

  it('syncs store data before building the daily report', async () => {
    const { scheduler, wechatStoreService, doudianBrowserService } = createHarness()

    await scheduler.handleDailyOrderReport()

    expect(wechatStoreService.syncAllStores).toHaveBeenCalledTimes(1)
    expect(doudianBrowserService.syncAllStores).toHaveBeenCalledTimes(1)
  })

  it('includes source breakdown lines in the report content', () => {
    const { scheduler } = createHarness()

    const content = scheduler.buildReportContent(
      '2026-07-28',
      [
        {
          storeName: 'Wechat Store',
          totalOrderCount: 3,
          orderCount: 2,
          totalAmount: 59800,
          refundCount: 1,
          refundAmount: 29900,
          sources: [
            {
              name: '达人 A',
              channel: '带货达人 / 联盟达人带货',
              orderCount: 2,
              totalAmount: 59800,
              refundCount: 1,
              refundAmount: 29900,
            },
            ...Array.from({ length: 10 }, (_, index) => ({
              name: `达人 ${index + 2}`,
              channel: '带货达人 / 联盟达人带货',
              orderCount: 1,
              totalAmount: 29900,
              refundCount: 0,
              refundAmount: 0,
            })),
          ],
        },
      ],
      [],
    )

    expect(content).toContain('达人/来源：')
    expect(content).toContain('达人 A')
    expect(content).toContain('达人 11')
    expect(content).not.toContain('达人带货')
    expect(content).toContain('出单：3 单')
    expect(content).toContain('计入成交额：2 单')
    expect(content).toContain('3 出单 / 2 计入成交额')
    expect(content).toContain('2单 / ¥598.00')
    expect(content).toContain('退1笔 / ¥299.00')
    expect(content).toContain('成交额：¥598.00（未扣退款）')
    expect(content).toContain('扣退款后：¥299.00')
    expect(content).toContain('口径：出单含关闭/取消；计入成交额不含关闭/取消，成交额未扣退款；退款仅统计成功退款。')
    expect(content).not.toContain('客单价')
    expect(content).not.toContain('占比')
  })

  it('creates inbox reports for every admin but pushes Feishu only once per organization report', async () => {
    const { notificationsService, scheduler } = createHarness()
    scheduler.getActiveStoreOrganizationIds = jest.fn().mockResolvedValue(['org-1'])
    scheduler.getAdminUserIds = jest.fn().mockResolvedValue(['admin-1', 'admin-2'])
    scheduler.collectWechatStoreSummaries = jest.fn().mockResolvedValue([
      {
        storeName: 'Wechat Store',
        totalOrderCount: 1,
        orderCount: 1,
        totalAmount: 29900,
        refundCount: 0,
        refundAmount: 0,
        sources: [],
      },
    ])
    scheduler.collectDoudianStoreSummaries = jest.fn().mockResolvedValue([])

    await scheduler.handleDailyOrderReport()

    expect(notificationsService.create).toHaveBeenCalledTimes(2)
    expect(notificationsService.create.mock.calls[0][0]).toEqual(
      expect.objectContaining({ userId: 'admin-1', pushFeishu: true }),
    )
    expect(notificationsService.create.mock.calls[1][0]).toEqual(
      expect.objectContaining({ userId: 'admin-2', pushFeishu: false }),
    )
  })
})
