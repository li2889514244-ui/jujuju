import { describe, expect, it } from 'vitest'
import { createLatestRequestGuard } from '@/utils/requestGuard'

describe('createLatestRequestGuard（防串月）', () => {
  it('只有最新一次请求允许写数据', () => {
    const guard = createLatestRequestGuard()
    const seq8 = guard.begin() // 切到 8 月
    const seq7 = guard.begin() // 快速切到 7 月
    const seq6 = guard.begin() // 快速切到 6 月
    expect(guard.isLatest(seq8)).toBe(false)
    expect(guard.isLatest(seq7)).toBe(false)
    expect(guard.isLatest(seq6)).toBe(true)
  })

  it('旧月份接口最后返回时被丢弃，不会覆盖新月份页面', async () => {
    const guard = createLatestRequestGuard()
    const slow = guard.begin() // 8 月请求（慢）
    const fast = guard.begin() // 7 月请求（快）
    // 7 月先返回并写入
    expect(guard.isLatest(fast)).toBe(true)
    // 8 月后返回：守卫拒绝
    expect(guard.isLatest(slow)).toBe(false)
  })

  it('连续多次切换后，中间所有请求全部过期', () => {
    const guard = createLatestRequestGuard()
    const seqs = Array.from({ length: 5 }, () => guard.begin())
    expect(guard.isLatest(seqs[3])).toBe(false)
    expect(guard.isLatest(seqs[4])).toBe(true)
  })
})
