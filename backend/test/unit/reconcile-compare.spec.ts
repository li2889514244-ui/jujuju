import {
  computeReconcileDifferences,
  ReconcileCounts,
} from '../../src/modules/scheduler/reconcile-compare'

function counts(overrides: Partial<ReconcileCounts> = {}): ReconcileCounts {
  return {
    count: 26,
    total: 26,
    valid: 17,
    refunded: 9,
    gross: 100000,
    refund: 30000,
    ...overrides,
  }
}

describe('computeReconcileDifferences', () => {
  it('returns no differences when both paths agree', () => {
    const code = counts()
    const sql = counts()
    expect(computeReconcileDifferences(code, sql)).toEqual([])
  })

  it('flags every mismatching field', () => {
    const code = counts()
    const sql = counts({ count: 25, total: 25, refunded: 8, gross: 99900, refund: 29900 })
    const differences = computeReconcileDifferences(code, sql)
    expect(differences).toEqual([
      'count(全量订单): 页面 26 vs 重算 25',
      'totalOrderCount: 页面 26 vs 重算 25',
      'refundedOrderCount: 页面 9 vs 重算 8',
      'gross: 页面 100000 vs 重算 99900',
      'refund: 页面 30000 vs 重算 29900',
    ])
  })

  it('flags the total = valid + refunded invariant when the page path violates it', () => {
    const code = counts({ total: 30 })
    const sql = counts()
    const differences = computeReconcileDifferences(code, sql)
    expect(differences).toContain('totalOrderCount: 页面 30 vs 重算 26')
    expect(differences).toContain('口径恒等式不成立: 30 ≠ 17 + 9')
  })

  it('derives the sql valid count as total minus refunded', () => {
    const code = counts()
    const sql = counts({ valid: 999 }) // sql valid is recomputed, so no valid diff
    const differences = computeReconcileDifferences(code, sql)
    expect(differences).toEqual([])
  })
})
