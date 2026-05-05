import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'
import type { ApiResponse } from '@/types'

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
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
  (error) => Promise.reject(error)
)

// Response interceptor
let isRefreshing = false
let pendingRequests: Array<(token: string) => void> = []

function handleTokenRefresh(response: AxiosResponse<ApiResponse>): Promise<AxiosResponse> {
  const userStore = useUserStore()

  if (!isRefreshing) {
    isRefreshing = true
    userStore
      .doRefreshToken()
      .then(() => {
        pendingRequests.forEach((cb) => cb(userStore.token))
        pendingRequests = []
      })
      .catch(() => {
        userStore.logout()
      })
      .finally(() => {
        isRefreshing = false
      })
  }

  return new Promise<AxiosResponse>((resolve) => {
    pendingRequests.push((token: string) => {
      response.config.headers.Authorization = `Bearer ${token}`
      resolve(service(response.config))
    })
  })
}

service.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const res = response.data
    if (res.code !== 0 && res.code !== 200) {
      ElMessage.error(res.message || '请求失败')
      if (res.code === 401) {
        return handleTokenRefresh(response)
      }
      return Promise.reject(new Error(res.message || '请求失败'))
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      return handleTokenRefresh(error.response)
    }
    ElMessage.error(error.response?.data?.message || error.message || '网络错误')
    return Promise.reject(error)
  }
)

// Helper methods - return ApiResponse<T> directly (unwrapped from AxiosResponse)
export function get<T = unknown>(url: string, params?: Record<string, unknown>, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
  return service.get<ApiResponse<T>>(url, { params, ...config }).then((res) => res.data)
}

export function post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
  return service.post<ApiResponse<T>>(url, data, config).then((res) => res.data)
}

export function put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
  return service.put<ApiResponse<T>>(url, data, config).then((res) => res.data)
}

export function del<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
  return service.delete<ApiResponse<T>>(url, config).then((res) => res.data)
}

export default service
