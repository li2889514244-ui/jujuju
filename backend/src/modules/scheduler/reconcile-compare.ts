export interface ReconcileCounts {
  count: number
  total: number
  valid: number
  refunded: number
  gross: number
  refund: number
}

/**
 * 对比页面口径（生产代码路径）与数据库独立重算的结果。
 * 任何字段不一致都会返回对应差异描述；空数组表示两路完全一致。
 */
export function computeReconcileDifferences(
  code: ReconcileCounts,
  sql: ReconcileCounts,
): string[] {
  const sqlValid = sql.total - sql.refunded
  const differences: string[] = []

  if (code.count !== sql.count)
    differences.push(`count(全量订单): 页面 ${code.count} vs 重算 ${sql.count}`)
  if (code.total !== sql.total)
    differences.push(`totalOrderCount: 页面 ${code.total} vs 重算 ${sql.total}`)
  if (code.valid !== sqlValid)
    differences.push(`validOrderCount: 页面 ${code.valid} vs 重算 ${sqlValid}`)
  if (code.refunded !== sql.refunded)
    differences.push(`refundedOrderCount: 页面 ${code.refunded} vs 重算 ${sql.refunded}`)
  if (code.gross !== sql.gross)
    differences.push(`gross: 页面 ${code.gross} vs 重算 ${sql.gross}`)
  if (code.refund !== sql.refund)
    differences.push(`refund: 页面 ${code.refund} vs 重算 ${sql.refund}`)
  if (code.total !== code.valid + code.refunded)
    differences.push(`口径恒等式不成立: ${code.total} ≠ ${code.valid} + ${code.refunded}`)

  return differences
}
