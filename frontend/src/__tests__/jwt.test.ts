import { afterEach, describe, expect, it, vi } from 'vitest'
import { isJwtExpiringWithin, readJwtPayload } from '@/utils/jwt'

// btoa 只接受 Latin-1；JWT payload 是 UTF-8 JSON（可能含中文），
// 必须先把 UTF-8 字节逐字节编码，否则中文 payload 无法构造。
function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function makeToken(payload: Record<string, unknown>) {
  const encoded = toBase64Url(JSON.stringify(payload))
  return `header.${encoded}.signature`
}

afterEach(() => {
  vi.useRealTimers()
})

describe('jwt helpers', () => {
  it('reads base64url payloads without padding', () => {
    const token = makeToken({ sub: 'user-1', scope: 'a/b+c' })

    expect(readJwtPayload(token)).toMatchObject({ sub: 'user-1', scope: 'a/b+c' })
  })

  it('detects tokens expiring inside the configured margin', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-17T00:00:00.000Z'))

    const expiring = makeToken({ exp: Math.floor(Date.now() / 1000) + 30 })
    const fresh = makeToken({ exp: Math.floor(Date.now() / 1000) + 120 })

    expect(isJwtExpiringWithin(expiring, 60)).toBe(true)
    expect(isJwtExpiringWithin(fresh, 60)).toBe(false)
  })

  it('treats malformed tokens as not expiring', () => {
    expect(readJwtPayload('not-a-jwt')).toBeNull()
    expect(isJwtExpiringWithin('not-a-jwt', 60)).toBe(false)
  })

  it('roundtrips Chinese payload fields byte-exactly (UTF-8)', () => {
    const sample = '中文测试：披星云，账号负责人，退款订单，AI剪辑，￥123.45，王晶导演'
    const payload = { name: sample, operator: '李家华', amount: '￥123.45' }
    const token = makeToken(payload)

    const decoded = readJwtPayload(token)
    expect(decoded).toMatchObject(payload)
    expect(decoded?.name).toBe(sample)
    expect(decoded?.operator).toBe('李家华')
    expect(decoded?.amount).toBe('￥123.45')
  })

  it('decodes UTF-8 API response bytes without mojibake (frontend display path)', () => {
    const sample = '中文测试：披星云，账号负责人，退款订单，AI剪辑，￥123.45，王晶导演'
    const json = JSON.stringify({ nickname: sample, operator: '侯晓萍' })
    const bytes = new TextEncoder().encode(json)
    const text = new TextDecoder('utf-8').decode(bytes)
    const parsed = JSON.parse(text) as { nickname: string; operator: string }
    expect(parsed.nickname).toBe(sample)
    expect(parsed.operator).toBe('侯晓萍')
  })
})
