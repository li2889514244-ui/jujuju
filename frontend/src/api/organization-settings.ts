import { get, del, patch } from './request'
import type { ApiResponse } from '@/types'
import { useUserStore } from '@/store/user'

export interface LoadingImageItem {
  fileName: string
  url: string
  createdAt: string
}

export interface LoadingImageConfig {
  images: LoadingImageItem[]
  randomEnabled: boolean
  defaultImageUrl: string
  hasCustom: boolean
}

export const organizationSettingsApi = {
  getLoadingImage() {
    return get<LoadingImageConfig>('/organization-settings/loading')
  },

  /**
   * 上传走原生 fetch：axios 实例默认头 Content-Type: application/json
   * 会破坏浏览器对 FormData 的 multipart 序列化（boundary 丢失导致后端收不到文件），
   * fetch + FormData 由浏览器自动设置带 boundary 的 multipart 头，最可靠。
   */
  async uploadLoadingImages(files: File[]): Promise<ApiResponse<LoadingImageConfig>> {
    const form = new FormData()
    files.forEach((file) => form.append('files', file))
    const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
    const userStore = useUserStore()
    const response = await fetch(base + '/organization-settings/loading', {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + (userStore.token || '') },
      body: form,
    })
    const data = (await response.json().catch(() => null)) as ApiResponse<LoadingImageConfig> | null
    if (!response.ok || !data || data.code !== 0) {
      const message =
        data?.message || (response.status === 401 ? '登录已过期，请重新登录' : '图片上传失败，请稍后重试')
      const error: Error & { silent?: boolean; status?: number } = new Error(message)
      error.silent = true
      error.status = response.status
      throw error
    }
    return data
  },

  deleteLoadingImage(fileName: string) {
    return del<LoadingImageConfig>('/organization-settings/loading/' + encodeURIComponent(fileName), {
      silent: true,
    } as any)
  },

  resetLoadingImages() {
    return del<LoadingImageConfig>('/organization-settings/loading')
  },

  updateLoadingPrefs(payload: { randomEnabled?: boolean; defaultFileName?: string | null }) {
    return patch<LoadingImageConfig>('/organization-settings/loading/prefs', payload, {
      silent: true,
    } as any)
  },
}
