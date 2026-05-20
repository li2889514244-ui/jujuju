import { describe, it, expect } from 'vitest'
import { getPlatformColor, getPlatformLabel, getPlatformChar } from '@/composables/usePlatform'

describe('usePlatform', () => {
  it('gets douyin color', () => { expect(getPlatformColor('douyin')).toBe('#000000') })
  it('gets xiaohongshu color', () => { expect(getPlatformColor('xiaohongshu')).toBe('#ff2442') })
  it('handles uppercase', () => { expect(getPlatformColor('DOUYIN')).toBe('#000000') })
  it('handles unknown platform', () => { expect(getPlatformColor('unknown')).toBe('#6e6e73') })
  it('aliases tencent to video_account', () => { expect(getPlatformColor('tencent')).toBe('#07c160') })

  it('gets label', () => { expect(getPlatformLabel('douyin')).toBe('抖音') })
  it('gets char', () => { expect(getPlatformChar('xiaohongshu')).toBe('红') })
})
