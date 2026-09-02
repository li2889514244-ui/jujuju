import { defineStore } from 'pinia'
import type { LoadingImageConfig } from '@/api/organization-settings'

const SHOW_DELAY_MS = 200 // 请求非常快时不显示，避免闪烁
const MIN_VISIBLE_MS = 400 // 一旦显示，至少停留，避免一闪而过

export const useLoadingStore = defineStore('globalLoading', {
  state: () => ({
    /** 正在刷新的请求数（支持并发叠加） */
    pending: 0,
    /** 遮罩是否可见 */
    visible: false,
    shownAt: 0,
    showTimer: null as ReturnType<typeof setTimeout> | null,
    hideTimer: null as ReturnType<typeof setTimeout> | null,
    /** 刷新动画图片库（组织级配置） */
    images: [] as string[],
    randomEnabled: true,
    defaultImageUrl: '',
    /** 上一次随机到的下标，避免连续两次同一张 */
    lastPickedIndex: -1,
    /** 配置是否已从服务端加载 */
    configLoaded: false,
  }),
  actions: {
    start() {
      this.pending += 1
      if (this.visible || this.showTimer) return
      this.showTimer = setTimeout(() => {
        this.showTimer = null
        this.visible = true
        this.shownAt = Date.now()
      }, SHOW_DELAY_MS)
    },
    stop() {
      if (this.pending > 0) this.pending -= 1
      if (this.pending > 0) return
      if (this.showTimer) {
        // 尚未显示就完成了：直接取消，不闪烁
        clearTimeout(this.showTimer)
        this.showTimer = null
        return
      }
      if (!this.visible) return
      if (this.hideTimer) return
      const elapsed = Date.now() - this.shownAt
      const remain = Math.max(0, MIN_VISIBLE_MS - elapsed)
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null
        this.visible = false
        this.shownAt = 0
      }, remain)
    },
    /** 加载失败/页面卸载兜底：立即停止 */
    stopNow() {
      if (this.showTimer) {
        clearTimeout(this.showTimer)
        this.showTimer = null
      }
      if (this.hideTimer) {
        clearTimeout(this.hideTimer)
        this.hideTimer = null
      }
      this.pending = 0
      this.visible = false
      this.shownAt = 0
    },
    setLoadingConfig(config: LoadingImageConfig) {
      this.images = (config.images || []).map((item) => item.url)
      this.randomEnabled = config.randomEnabled !== false
      this.defaultImageUrl = config.defaultImageUrl || ''
    },
    /** 随机取一张（尽量不与上一次重复） */
    pickRandomImage(): string {
      if (this.images.length === 0) return ''
      if (this.images.length === 1) {
        this.lastPickedIndex = 0
        return this.images[0]
      }
      const candidates = this.images
        .map((_, index) => index)
        .filter((index) => index !== this.lastPickedIndex)
      const index = candidates[Math.floor(Math.random() * candidates.length)]
      this.lastPickedIndex = index
      return this.images[index]
    },
    /** 固定模式：用户指定的默认图，未指定则用第一张 */
    fixedImageUrl(): string {
      if (this.defaultImageUrl) return this.defaultImageUrl
      return this.images[0] || ''
    },
    setConfigLoaded(loaded: boolean) {
      this.configLoaded = loaded
    },
  },
})
