import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'
import type { ApiResponse } from '@/types'

type RetriableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean }

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor
service.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const userStore = useUserStore()
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// Response interceptor
let isRefreshing = false
let pendingRequests: Array<{
  resolve: (token: string) => void
  reject: (error: Error) => void
}> = []

function isAuthEndpoint(url = '') {
  return ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].some((path) =>
    url.includes(path),
  )
}

function rejectExpiredSession(error?: unknown): Promise<never> {
  const userStore = useUserStore()
  userStore.logout()
  return Promise.reject(error instanceof Error ? error : new Error('登录已过期，请重新登录'))
}

function handleTokenRefresh(config?: RetriableRequestConfig): Promise<AxiosResponse> {
  const userStore = useUserStore()

  if (!config || config._retry || isAuthEndpoint(config.url) || !userStore.refreshToken) {
    return rejectExpiredSession()
  }

  config._retry = true

  if (!isRefreshing) {
    isRefreshing = true
    userStore
      .doRefreshToken()
      .then(() => {
        pendingRequests.forEach((cb) => cb.resolve(userStore.token))
        pendingRequests = []
      })
      .catch((err: Error) => {
        // 刷新失败时，reject 所有等待中的请求，然后登出
        pendingRequests.forEach((cb) => cb.reject(err))
        pendingRequests = []
        userStore.logout()
      })
      .finally(() => {
        isRefreshing = false
      })
  }

  return new Promise<AxiosResponse>((resolve, reject) => {
    pendingRequests.push({
      resolve: (token: string) => {
        config.headers.Authorization = `Bearer ${token}`
        resolve(service(config))
      },
      reject: (error: Error) => {
        reject(error)
      },
    })
  })
}

service.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data
    if (res.code !== 0 && res.code !== 200) {
      if (!response.config.url?.includes('/notifications')) {
        ElMessage.error(res.message || '请求失败')
      }
      if (res.code === 401) {
        return handleTokenRefresh(response.config as RetriableRequestConfig)
      }
      return Promise.reject(new Error(res.message || '请求失败'))
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      return handleTokenRefresh(error.config as RetriableRequestConfig | undefined)
    }
    const isNotif = error.config?.url?.includes('/notifications')
    if (!isNotif) {
      ElMessage.error(error.response?.data?.message || error.message || '网络错误')
    }
    return Promise.reject(error)
  },
)

// Helper methods - return ApiResponse<T> directly (unwrapped from AxiosResponse)
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

export function del<T = unknown>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<T>> {
  return service.delete<ApiResponse<T>>(url, config).then((res) => res.data)
}

export default service
