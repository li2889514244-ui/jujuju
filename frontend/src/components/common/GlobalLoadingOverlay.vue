<template>
  <teleport to="body">
    <transition name="global-loading-fade">
      <div
        v-if="store.visible"
        class="global-loading-overlay"
        :style="overlayStyle"
        role="status"
        aria-live="polite"
        aria-label="刷新中"
      >
        <div class="global-loading__box">
          <transition name="spin-img-fade" mode="out-in">
            <img
              :key="imageSrc"
              class="global-loading__img"
              :src="imageSrc"
              alt="刷新中"
              draggable="false"
              @error="onImageError"
            />
          </transition>
          <div class="global-loading__text">刷新中...</div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { useLoadingStore } from '@/store/loading'
import defaultLogo from '@/assets/logo.svg'

const store = useLoadingStore()
const overlayStyle = ref<CSSProperties>({})
const imageFailed = ref(false)
const displayUrl = ref('')
let rotationTimer: ReturnType<typeof setInterval> | null = null

// 轮播间隔：刷新时间较长时每 2.5 秒随机换一张
const ROTATE_INTERVAL_MS = 2500

const imageSrc = computed(() => {
  if (displayUrl.value && !imageFailed.value) return displayUrl.value
  return defaultLogo
})

function onImageError() {
  imageFailed.value = true
}

function pickNext() {
  const next = store.randomEnabled ? store.pickRandomImage() : store.fixedImageUrl()
  if (next) {
    imageFailed.value = false
    displayUrl.value = next
  }
}

function startRotation() {
  stopRotation()
  pickNext()
  if (store.randomEnabled && store.images.length > 1) {
    rotationTimer = setInterval(pickNext, ROTATE_INTERVAL_MS)
  }
}

function stopRotation() {
  if (rotationTimer) {
    clearInterval(rotationTimer)
    rotationTimer = null
  }
}

function updateRect() {
  const el = document.querySelector('main.app-layout__content')
  if (!el) return
  const rect = el.getBoundingClientRect()
  overlayStyle.value = {
    top: rect.top + 'px',
    left: rect.left + 'px',
    width: rect.width + 'px',
    height: rect.height + 'px',
  }
}

watch(
  () => store.visible,
  (visible) => {
    // 主内容区在刷新期间轻微压暗（配合 global.scss 的过渡）
    document.body.classList.toggle('global-loading-active', visible)
    if (visible) {
      updateRect()
      startRotation()
    } else {
      stopRotation()
      displayUrl.value = ''
    }
  },
)

function onResize() {
  if (store.visible) updateRect()
}

onMounted(() => {
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  stopRotation()
  document.body.classList.remove('global-loading-active')
})
</script>

<style lang="scss" scoped>
.global-loading-overlay {
  position: fixed;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba($bg-deep, 0.38);
  backdrop-filter: blur(2px);
  pointer-events: auto;
  cursor: progress;
}

.global-loading__box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.global-loading__img {
  // 固定 200px，小屏自适应缩小避免溢出（200px 与 35vw 取小）
  width: min(200px, 35vw);
  height: min(200px, 35vw);
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba($accent-500, 0.35), 0 10px 30px rgba(0, 0, 0, 0.35);
  animation: global-loading-spin 2.4s linear infinite;
  user-select: none;
  display: block;
}

.global-loading__text {
  color: $text-primary;
  font-size: 14px;
  letter-spacing: 0.04em;
}

@keyframes global-loading-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

// 轮播换图：轻微淡入淡出，不闪图
.spin-img-fade-enter-active,
.spin-img-fade-leave-active {
  transition: opacity var(--motion-normal) var(--ease-standard);
}

.spin-img-fade-enter-from,
.spin-img-fade-leave-to {
  opacity: 0;
}

.global-loading-fade-enter-active,
.global-loading-fade-leave-active {
  transition: opacity var(--motion-normal) var(--ease-standard);
}

.global-loading-fade-enter-from,
.global-loading-fade-leave-to {
  opacity: 0;
}
</style>
