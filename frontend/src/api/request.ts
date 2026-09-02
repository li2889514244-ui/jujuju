import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'
import type { ApiResponse } from '@/types'
import { isJwtExpiringWithin } from '@/utils/jwt'
import { createRequestId, reportApiFailure } from '@/utils/frontend-monitor'

type RetriableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean; _requestStartedAt?: number; _requestId?: string }

const SESSION_EXPIRED_MESSAGE = '登录已过期，请重新登录'
const REQUEST_FAILED_MESSAGE = '请求失败，请检查输入后重试'
const OPERATION_FAILED_MESSAGE = '操作失败，请稍后重试'
const NETWORK_ERROR_MESSAGE = '网络错误'
const TOKEN_REFRESH_MARGIN_SECONDS = 60

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

let refreshPromise: Promise<string> | null = null

function isAuthEndpoint(url = '') {
  return ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', '/auth/feishu'].some((path) =>
    url.includes(path),
  )
}

function isMojibake(message: string) {
  return /[\uFFFD\u9435\u74D2\u7025\u95B2\u7BA1\u934B\u93C3\u7487\u95AD\u93B4\u8930\uFF0C\u9286\u20AC]/.test(
    message,
  )
}

function readableMessage(message: unknown, fallback = OPERATION_FAILED_MESSAGE) {
  if (typeof message !== 'string' || !message.trim()) return fallback
  return isMojibake(message) ? fallback : message
}

function isTokenExpiringSoon(token: string): boolean {
  return isJwtExpiringWithin(token, TOKEN_REFRESH_MARGIN_SECONDS)
}

function rejectExpiredSession(error?: unknown): Promise<never> {
  const userStore = useUserStore()
  userStore.logout()
  return Promise.reject(error instanceof Error ? error : new Error(SESSION_EXPIRED_MESSAGE))
}

function refreshAccessToken(): Promise<string> {
  const userStore = useUserStore()
  if (!userStore.refreshToken) {
    return Promise.reject(new Error(SESSION_EXPIRED_MESSAGE))
  }

  if (!refreshPromise) {
    refreshPromise = userStore
      .doRefreshToken()
      .then(() => {
        if (!userStore.token) {
          throw new Error(SESSION_EXPIRED_MESSAGE)
        }
        return userStore.token
      })
      .catch((error: Error) => {
        userStore.logout()
        throw error instanceof Error ? error : new Error(SESSION_EXPIRED_MESSAGE)
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

async function handleTokenRefresh(config?: RetriableRequestConfig): Promise<AxiosResponse> {
  const userStore = useUserStore()

  if (!config || config._retry || isAuthEndpoint(config.url) || !userStore.refreshToken) {
    return rejectExpiredSession()
  }

  config._retry = true

  try {
    const freshToken = await refreshAccessToken()
    config.headers.Authorization = `Bearer ${freshToken}`
    return service(config)
  } catch (error) {
    return rejectExpiredSession(error)
  }
}

service.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const tracedConfig = config as RetriableRequestConfig
    const requestId = createRequestId()
    tracedConfig._requestStartedAt = Date.now()
    tracedConfig._requestId = requestId
    config.headers['X-Request-Id'] = requestId
    config.headers['X-Trace-Id'] = requestId

    const userStore = useUserStore()
    if (
      userStore.token &&
      userStore.refreshToken &&
      !isAuthEndpoint(config.url) &&
      isTokenExpiringSoon(userStore.token)
    ) {
      try {
        await refreshAccessToken()
      } catch {
        // Response interceptor will route the request to login if the refresh is unrecoverable.
      }
    }

    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

service.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data
    const isSuccess = res.code === 0 || res.code === 200
    if (!isSuccess) {
      if (res.code === 401) {
        return handleTokenRefresh(response.config as RetriableRequestConfig)
      }

      const tracedConfig = response.config as RetriableRequestConfig
      reportApiFailure({
        url: response.config.url,
        statusCode: response.status,
        businessCode: res.code,
        durationMs: tracedConfig._requestStartedAt ? Date.now() - tracedConfig._requestStartedAt : undefined,
        requestId: response.headers?.['x-request-id'] || tracedConfig._requestId,
        message: readableMessage(res.message, REQUEST_FAILED_MESSAGE),
      })

      const message = readableMessage(res.message, REQUEST_FAILED_MESSAGE)
      if (!response.config.url?.includes('/notifications')) {
        ElMessage.error(message)
      }
      return Promise.reject(new Error(message))
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      return handleTokenRefresh(error.config as RetriableRequestConfig | undefined)
    }
    const isNotif = error.config?.url?.includes('/notifications')
    // silent 标记：调用方自行处理错误提示（技术细节只进日志，不暴露给用户）
    const isSilent = (error.config as any)?.silent === true
    const message = readableMessage(error.response?.data?.message || error.message, NETWORK_ERROR_MESSAGE)
    const tracedConfig = error.config as RetriableRequestConfig | undefined
    reportApiFailure({
      url: tracedConfig?.url,
      statusCode: error.response?.status,
      durationMs: tracedConfig?._requestStartedAt ? Date.now() - tracedConfig._requestStartedAt : undefined,
      requestId: error.response?.headers?.['x-request-id'] || tracedConfig?._requestId,
      message,
    })
    if (!isNotif && !isSilent) {
      ElMessage.error(message)
    }
    if (error instanceof Error) {
      error.message = message
      return Promise.reject(error)
    }
    return Promise.reject(new Error(message))
  },
)

export function get<T = unknown>(
  url: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<T>> {
  return service.get<ApiResponse<T>>(url, { params, ...config }).then((res) => res.data)
}

export function post<T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<T>> {
  return service.post<ApiResponse<T>>(url, data, config).then((res) => res.data)
}

export function put<T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<T>> {
  return service.put<ApiResponse<T>>(url, data, config).then((res) => res.data)
}

export function patch<T = unknown>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<T>> {
  return service.patch<ApiResponse<T>>(url, data, config).then((res) => res.data)
}

export function del<T = unknown>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<T>> {
  return service.delete<ApiResponse<T>>(url, config).then((res) => res.data)
}

export default service
