import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import service, { get } from '@/api/request'
import { useUserStore } from '@/store/user'
import type { ApiResponse } from '@/types'

const mocks = vi.hoisted(() => ({
  messageError: vi.fn(),
  routerPush: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    error: mocks.messageError,
  },
}))

vi.mock('@/router', () => ({
  default: {
    push: mocks.routerPush,
  },
}))

type RetriableTestConfig = InternalAxiosRequestConfig & { _retry?: boolean }

const originalAdapter = service.defaults.adapter

function response<T>(
  config: InternalAxiosRequestConfig,
  data: ApiResponse<T>,
): AxiosResponse<ApiResponse<T>> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  mocks.messageError.mockReset()
  mocks.routerPush.mockReset()
})

afterEach(() => {
  service.defaults.adapter = originalAdapter
})

describe('request token refresh', () => {
  it('refreshes and retries a business 401 without showing an error first', async () => {
    const userStore = useUserStore()
    userStore.token = 'old-access'
    userStore.refreshToken = 'old-refresh'

    let refreshCalls = 0
    let protectedCalls = 0
    const seenAuthorization: string[] = []

    service.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      const auth = config.headers.Authorization
      seenAuthorization.push(typeof auth === 'string' ? auth : '')

      if (config.url === '/auth/refresh') {
        refreshCalls += 1
        return response(config, {
          code: 0,
          message: 'success',
          data: { accessToken: 'fresh-access', refreshToken: 'fresh-refresh' },
        })
      }

      if (config.url === '/protected') {
        protectedCalls += 1
        if (!(config as RetriableTestConfig)._retry) {
          return response(config, { code: 401, message: 'expired', data: null })
        }
        return response(config, { code: 0, message: 'success', data: { ok: true } })
      }

      throw new Error(`Unexpected request ${config.url}`)
    }) as AxiosAdapter

    const result = await get<{ ok: boolean }>('/protected')

    expect(result.data.ok).toBe(true)
    expect(refreshCalls).toBe(1)
    expect(protectedCalls).toBe(2)
    expect(userStore.token).toBe('fresh-access')
    expect(userStore.refreshToken).toBe('fresh-refresh')
    expect(seenAuthorization).toContain('Bearer fresh-access')
    expect(mocks.messageError).not.toHaveBeenCalled()
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('reuses one refresh request for concurrent 401 retries', async () => {
    const userStore = useUserStore()
    userStore.token = 'old-access'
    userStore.refreshToken = 'old-refresh'

    let refreshCalls = 0
    let releaseRefresh: (() => void) | undefined
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve
    })
    const attempts: Record<string, number> = {}

    service.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      if (config.url === '/auth/refresh') {
        refreshCalls += 1
        await refreshGate
        return response(config, {
          code: 0,
          message: 'success',
          data: { accessToken: 'fresh-access', refreshToken: 'fresh-refresh' },
        })
      }

      if (config.url?.startsWith('/protected-')) {
        attempts[config.url] = (attempts[config.url] || 0) + 1
        if (!(config as RetriableTestConfig)._retry) {
          return response(config, { code: 401, message: 'expired', data: null })
        }
        return response(config, {
          code: 0,
          message: 'success',
          data: { url: config.url, auth: config.headers.Authorization },
        })
      }

      throw new Error(`Unexpected request ${config.url}`)
    }) as AxiosAdapter

    const first = get<{ url: string; auth: string }>('/protected-a')
    const second = get<{ url: string; auth: string }>('/protected-b')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(refreshCalls).toBe(1)
    releaseRefresh?.()

    const results = await Promise.all([first, second])

    expect(results.map((item) => item.data.auth)).toEqual([
      'Bearer fresh-access',
      'Bearer fresh-access',
    ])
    expect(attempts['/protected-a']).toBe(2)
    expect(attempts['/protected-b']).toBe(2)
    expect(refreshCalls).toBe(1)
    expect(mocks.messageError).not.toHaveBeenCalled()
  })

  it('logs out only when refresh is unrecoverable', async () => {
    const userStore = useUserStore()
    userStore.token = 'old-access'
    userStore.refreshToken = 'old-refresh'

    service.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      if (config.url === '/auth/refresh') {
        return response(config, { code: 401, message: 'refresh expired', data: null })
      }

      if (config.url === '/protected') {
        return response(config, { code: 401, message: 'expired', data: null })
      }

      throw new Error(`Unexpected request ${config.url}`)
    }) as AxiosAdapter

    await expect(get('/protected')).rejects.toThrow()

    expect(userStore.token).toBe('')
    expect(userStore.refreshToken).toBe('')
    expect(mocks.routerPush).toHaveBeenCalledWith('/login')
  })
})
