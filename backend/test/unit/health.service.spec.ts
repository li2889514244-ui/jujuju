import { HealthService } from '../../src/modules/health/health.service'
import * as os from 'os'

describe('HealthService', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    jest.restoreAllMocks()
  })

  function createService(queryRaw: jest.Mock) {
    return new HealthService({ $queryRaw: queryRaw } as any)
  }

  it('returns ok when database and memory checks pass', async () => {
    const service = createService(jest.fn().mockResolvedValue([{ ok: 1 }]))

    await expect(service.check()).resolves.toMatchObject({
      status: 'ok',
      checks: {
        database: { status: 'ok' },
        memory: { status: 'ok' },
      },
    })
  })

  it('returns error when the database check fails', async () => {
    const service = createService(jest.fn().mockRejectedValue(new Error('db unavailable')))

    await expect(service.check()).resolves.toMatchObject({
      status: 'error',
      checks: {
        database: { status: 'error' },
      },
    })
  })

  it('does not fail health on a high V8 heap ratio when RSS is small', async () => {
    jest.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 200 * 1024 * 1024,
      heapTotal: 100 * 1024 * 1024,
      heapUsed: 96 * 1024 * 1024,
      external: 0,
      arrayBuffers: 0,
    })
    jest.spyOn(os, 'totalmem').mockReturnValue(16 * 1024 * 1024 * 1024)
    const service = createService(jest.fn().mockResolvedValue([{ ok: 1 }]))

    await expect(service.check()).resolves.toMatchObject({
      status: 'ok',
      checks: {
        memory: { status: 'ok', usedMB: 200 },
      },
    })
  })

  it('fails health when RSS crosses both percentage and absolute thresholds', async () => {
    jest.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 2 * 1024 * 1024 * 1024,
      heapTotal: 100 * 1024 * 1024,
      heapUsed: 40 * 1024 * 1024,
      external: 0,
      arrayBuffers: 0,
    })
    jest.spyOn(os, 'totalmem').mockReturnValue(2 * 1024 * 1024 * 1024)
    const service = createService(jest.fn().mockResolvedValue([{ ok: 1 }]))

    await expect(service.check()).resolves.toMatchObject({
      status: 'error',
      checks: {
        memory: { status: 'error', usedMB: 2048 },
      },
    })
  })

  it('keeps production health details hidden while preserving error status', async () => {
    process.env.NODE_ENV = 'production'
    const service = createService(jest.fn().mockRejectedValue(new Error('db unavailable')))

    const result = await service.check()

    expect(result.status).toBe('error')
    expect(result.checks).toBeUndefined()
  })
})
