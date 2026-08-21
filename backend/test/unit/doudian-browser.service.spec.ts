import { DoudianBrowserService } from '../../src/modules/doudian-browser/doudian-browser.service'

describe('DoudianBrowserService', () => {
  function createService(prisma: any = {}) {
    return new DoudianBrowserService(prisma) as any
  }

  it('classifies known Doudian API endpoints', () => {
    const service = createService()

    expect(service.classifyEndpoint('https://fxg.jinritemai.com/api/order/searchlist')).toBe(
      'orders',
    )
    expect(service.classifyEndpoint('https://fxg.jinritemai.com/after_sale/pc/list')).toBe(
      'aftersales',
    )
  })

  it('ignores malformed response URLs instead of throwing from the response listener', () => {
    const service = createService()

    expect(service.classifyEndpoint('jinritemai.com/api/order/searchlist')).toBeNull()
  })

  it('normalizes malformed order numbers before writing captured Doudian orders', async () => {
    const findUnique = jest.fn().mockResolvedValue(null)
    const upsert = jest.fn().mockResolvedValue({})
    const service = createService({
      doudianStoreOrder: { findUnique, upsert },
    })

    await service.saveOrders(
      'store-1',
      {
        data: [
          {
            shop_order_id: 'order-1',
            order_status: 'bad',
            pay_amount: 'bad',
            total_pay_amount: '12900',
            post_amount: 'bad',
            product_count: '--',
            create_time: 'bad',
            update_time: '1700000000',
          },
        ],
      },
      new Date('2026-01-01T00:00:00.000Z'),
    )

    expect(upsert).toHaveBeenCalledTimes(1)
    const update = upsert.mock.calls[0][0].update
    expect(update).toMatchObject({
      status: 0,
      payAmount: 12900,
      postAmount: 0,
      productCount: 0,
      createTime: 0,
      updateTime: 1700000000,
    })
    expect(
      ['status', 'payAmount', 'postAmount', 'productCount', 'createTime', 'updateTime'].every(
        (field) => Number.isFinite(update[field]),
      ),
    ).toBe(true)
  })
})
