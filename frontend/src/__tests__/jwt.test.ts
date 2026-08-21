import { afterEach, describe, expect, it, vi } from 'vitest'
import { isJwtExpiringWithin, readJwtPayload } from '@/utils/jwt'

function makeToken(payload: Record<string, unknown>) {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
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
})
