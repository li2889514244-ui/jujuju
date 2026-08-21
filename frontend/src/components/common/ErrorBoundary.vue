<template>
  <template v-if="hasError">
    <div class="error-boundary">
      <div class="error-boundary__card">
        <div class="error-boundary__icon">
          <svg viewBox="0 0 48 48" fill="none" width="48" height="48">
            <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2" opacity="0.3" />
            <path d="M24 14v12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            <circle cx="24" cy="33" r="1.5" fill="currentColor" />
          </svg>
        </div>
        <h2>页面出错了</h2>
        <p>{{ errorMessage || '组件渲染时发生异常，请刷新页面重试。' }}</p>
        <div class="error-boundary__actions">
          <el-button type="primary" @click="handleReload">刷新页面</el-button>
          <el-button @click="handleReset">返回首页</el-button>
        </div>
      </div>
    </div>
  </template>
  <template v-else>
    <slot />
  </template>
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const hasError = ref(false)
const errorMessage = ref('')

onErrorCaptured((error: Error) => {
  console.error('[ErrorBoundary]', error)
  hasError.value = true
  errorMessage.value = import.meta.env.PROD
    ? '' // 生产环境不暴露错误详情
    : error.message
  // 阻止错误继续向上传播
  return false
})

function handleReload() {
  hasError.value = false
  window.location.reload()
}

function handleReset() {
  hasError.value = false
  router.push('/dashboard')
}
</script>

<style lang="scss" scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 32px;

  &__card {
    text-align: center;
    max-width: 400px;
  }

  &__icon {
    color: $color-warning;
    margin-bottom: 16px;
  }

  h2 {
    font-size: 18px;
    font-weight: 600;
    color: $text-primary;
    margin: 0 0 8px;
  }

  p {
    font-size: 14px;
    color: $text-tertiary;
    margin: 0 0 24px;
    line-height: 1.6;
  }

  &__actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }
}
</style>
