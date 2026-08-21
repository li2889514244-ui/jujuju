import { describe, expect, it } from 'vitest'
import {
  filterDoudianRefunds,
  getDoudianRevenueOrders,
  getDoudianSuccessfulRefundOrderIds,
  isDoudianClosedOrder,
} from '@/utils/doudianStoreMetrics'

describe('doudianStoreMetrics', () => {
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
    const range = { start: 200, end: 299 }
    const aftersales = [
      {
        order_id: 'old-order',
        status: 12,
        amount: 29900,
        create_time: 100,
        update_time: 220,
      },
    ]

    const refunds = filterDoudianRefunds(aftersales, range, 'today', new Set())

    expect(refunds).toHaveLength(1)
    expect(refunds[0].order_id).toBe('old-order')
  })

  it('limits week/month refunds to orders that were sold in the same range', () => {
    const range = { start: 100, end: 199 }
    const aftersales = [
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
    ]

    const refunds = filterDoudianRefunds(aftersales, range, 'week', new Set(['range-order']))

    expect(refunds).toHaveLength(1)
    expect(refunds[0].order_id).toBe('range-order')
    expect(refunds.reduce((sum, item) => sum + Number(item.amount || 0), 0)).toBe(29900)
  })
})
