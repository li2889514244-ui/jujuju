/**
 * 最新请求守卫：防止快速连续切换月份时，旧月份接口后返回覆盖新月份页面（串月）。
 *
 * 用法：
 *   const guard = createLatestRequestGuard()
 *   async function load(month: string) {
 *     const seq = guard.begin()
 *     const data = await fetchMonth(month)
 *     if (!guard.isLatest(seq)) return  // 已有更新的请求，丢弃本次结果
 *     apply(data)
 *   }
 */
export interface LatestRequestGuard {
  begin(): number
  isLatest(seq: number): boolean
}

export function createLatestRequestGuard(): LatestRequestGuard {
  let current = 0
  return {
    begin() {
      current += 1
      return current
    },
    isLatest(seq: number) {
      return seq === current
    },
  }
}
