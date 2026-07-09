import {
  buildDoudianSummary,
  getDoudianRevenueOrders,
  getDoudianSuccessfulRefundOrderIds,
  isDoudianClosedOrder,
} from '../../src/modules/doudian-browser/doudian-store-metrics'

describe('Doudian store metrics', () => {
  it('keeps closed orders when they have a successful refund record', () => {
    const orders = [
      { order_id: 'active-1', status: 3, pay_amount: 29900, create_time: 100 },
      { order_id: 'closed-with-refund', status: 4, pay_amount: 29900, create_time: 100 },
      { order_id: 'closed-without-refund', status: 4, pay_amount: 29900, create_time: 100 },
    ]
    const aftersales = [
      {
        order_id: 'closed-with-refund',
        status: 12,
        amount: 29900,
        create_time: 100,
        update_time: 120,
      },
    ]

    const refundOrderIds = getDoudianSuccessfulRefundOrderIds(aftersales)
    const revenueOrders = getDoudianRevenueOrders(orders, refundOrderIds)

    expect(isDoudianClosedOrder(orders[1])).toBe(true)
    expect(revenueOrders.map((order) => order.order_id)).toEqual(['active-1', 'closed-with-refund'])
    expect(revenueOrders.reduce((sum, order) => sum + Number(order.pay_amount || 0), 0)).toBe(59800)
  })

  it('uses refund success time for single-day ranges', () => {
    const summary = buildDoudianSummary(
      [],
      [
        {
          order_id: 'old-order',
          status: 12,
          amount: 29900,
          create_time: 100,
          update_time: 220,
        },
      ],
      { start: 200, end: 299 },
      'today',
    )

    expect(summary.refundCount).toBe(1)
    expect(summary.refund).toBe(29900)
  })

  it('limits week/month refunds to orders that were sold in the same range', () => {
    const summary = buildDoudianSummary(
      [{ order_id: 'range-order', status: 3, pay_amount: 59800, create_time: 120 }],
      [
        {
          order_id: 'range-order',
          status: 12,
          amount: 29900,
          create_time: 120,
          update_time: 130,
        },
        {
          order_id: 'outside-order',
          status: 12,
          amount: 29900,
          create_time: 140,
          update_time: 150,
        },
      ],
      { start: 100, end: 199 },
      'week',
    )

    expect(summary.gross).toBe(59800)
    expect(summary.effectiveCount).toBe(1)
    expect(summary.refundCount).toBe(1)
    expect(summary.refund).toBe(29900)
  })
})
