import { describe, expect, it } from 'vitest'
import { readJsonOr } from '@/utils/http'

describe('http helpers', () => {
  it('reads valid JSON responses', async () => {
    const response = new Response('{"code":0,"data":["ok"]}', {
      headers: { 'Content-Type': 'application/json' },
    })

    await expect(readJsonOr(response, { code: -1 })).resolves.toEqual({
      code: 0,
      data: ['ok'],
    })
  })

  it('returns the fallback for empty or malformed responses', async () => {
    await expect(readJsonOr(new Response(''), { code: -1 })).resolves.toEqual({ code: -1 })
    await expect(readJsonOr(new Response('<html>bad gateway</html>'), { code: -1 })).resolves.toEqual({
      code: -1,
    })
  })
})
