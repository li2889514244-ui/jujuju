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

  it('attributes refunds by order date instead of refund time', () => {
    // 退款发生时间（update_time=220）在时间范围内，但订单不在所选范围（revenue 为空），
    // 统一口径下不应计入退款。
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

    expect(summary.refundCount).toBe(0)
    expect(summary.refund).toBe(0)
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
    // 该订单有成功退款：不再计入有效订单，只计入退款订单
    expect(summary.effectiveCount).toBe(0)
    expect(summary.refundCount).toBe(1)
    expect(summary.validOrderCount).toBe(0)
    expect(summary.refundedOrderCount).toBe(1)
    expect(summary.totalOrderCount).toBe(1)
    expect(summary.refund).toBe(29900)
  })

  it('deduplicates refunded orders in summary totals', () => {
    const summary = buildDoudianSummary(
      [
        { order_id: 'valid-1', status: 3, pay_amount: 29900, create_time: 100 },
        { order_id: 'refund-1', status: 4, pay_amount: 29900, create_time: 100 },
      ],
      [
        { id: 'after-1', order_id: 'refund-1', status: 12, amount: 10000, update_time: 120 },
        { id: 'after-2', order_id: 'refund-1', status: 12, amount: 19900, update_time: 130 },
      ],
      { start: 90, end: 140 },
      'today',
    )

    // 有效订单 = 营收订单 - 退款订单；总订单 = 有效 + 退款，不再重复计数
    expect(summary.validOrderCount).toBe(1)
    expect(summary.refundedOrderCount).toBe(1)
    expect(summary.refundCount).toBe(1)
    expect(summary.totalOrderCount).toBe(2)
    expect(summary.statusBreakdown.find((item) => item.label.includes('售后'))?.count).toBe(1)
  })
})
