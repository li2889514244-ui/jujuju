<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="添加平台账号"
    width="520px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <!-- Step 1: 选择平台 -->
    <div v-if="step === 'select'" class="scan-bind__platforms">
      <p class="scan-bind__tip">选择要绑定的平台，系统将在本地浏览器中打开登录页供您扫码</p>
      <div class="scan-bind__grid">
        <div
          v-for="p in platforms"
          :key="p.value"
          class="scan-bind__platform-card"
          @click="handleSelectPlatform(p.value)"
        >
          <div class="scan-bind__platform-icon" :style="{ background: p.color }">
            {{ p.icon }}
          </div>
          <span class="scan-bind__platform-name">{{ p.label }}</span>
        </div>
      </div>
    </div>

    <!-- Step 2: 扫码中 -->
    <div v-else-if="step === 'scanning'" class="scan-bind__scanning">
      <div class="scan-bind__status">
        <el-icon v-if="!qrImage" class="is-loading"><Loading /></el-icon>
        <span>{{ statusMessage }}</span>
      </div>

      <div class="scan-bind__qr-container">
        <img v-if="qrImage" :src="qrImage" class="scan-bind__qr-image" alt="扫码登录" />
        <div v-else class="scan-bind__qr-placeholder">
          <el-icon class="is-loading" :size="32"><Loading /></el-icon>
          <span>正在启动本地浏览器...</span>
        </div>
      </div>

      <p class="scan-bind__hint">本地 Chrome 窗口已打开，请用「{{ selectedPlatformLabel }}」App 扫描窗口中的二维码</p>

      <div class="scan-bind__actions">
        <el-button @click="handleCancel">取消</el-button>
      </div>
    </div>

    <!-- Step 3: 成功 -->
    <div v-else-if="step === 'success'" class="scan-bind__success">
      <el-result icon="success" title="绑定成功">
        <template #sub-title>
          <div class="scan-bind__account-info">
            <el-avatar :size="48" :src="boundAccount?.avatar">
              {{ boundAccount?.nickname?.charAt(0) }}
            </el-avatar>
            <div>
              <div class="scan-bind__account-name">{{ boundAccount?.nickname }}</div>
              <div class="scan-bind__account-platform">{{ selectedPlatformLabel }}</div>
            </div>
          </div>
        </template>
        <template #extra>
          <el-button type="primary" @click="handleDone">完成</el-button>
          <el-button @click="handleAddAnother">继续添加</el-button>
        </template>
      </el-result>
    </div>

    <!-- Step 4: 失败 -->
    <div v-else-if="step === 'error'" class="scan-bind__error">
      <el-result icon="error" :title="errorMessage">
        <template #extra>
          <el-button type="primary" @click="handleRetry">重试</el-button>
          <el-button @click="handleClose">关闭</el-button>
        </template>
      </el-result>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useUserStore } from '@/store/user'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'success': []
}>()

const userStore = useUserStore()

const platforms = [
  { value: 'douyin', label: '抖音', icon: '抖', color: '#000000' },
  { value: 'xiaohongshu', label: '小红书', icon: '红', color: '#FF2442' },
  { value: 'kuaishou', label: '快手', icon: '快', color: '#FF4906' },
  { value: 'tencent', label: '视频号', icon: '视', color: '#07C160' },
]

const PLATFORM_TO_FLASK: Record<string, string> = {
  douyin: 'douyin',
  xiaohongshu: 'xiaohongshu',
  kuaishou: 'kuaishou',
  tencent: 'tencent',
}

const step = ref<'select' | 'scanning' | 'success' | 'error'>('select')
const selectedPlatform = ref('')
const statusMessage = ref('正在启动本地浏览器...')
const qrImage = ref('')
const errorMessage = ref('')
const boundAccount = ref<any>(null)

let eventSource: EventSource | null = null
let scanTimeout: ReturnType<typeof setTimeout> | null = null

const selectedPlatformLabel = computed(() => {
  return platforms.find(p => p.value === selectedPlatform.value)?.label || ''
})

watch(() => props.visible, (val) => {
  if (val) {
    step.value = 'select'
    resetState()
  } else {
    disconnectSSE()
  }
})

onUnmounted(() => {
  disconnectSSE()
})

function resetState() {
  selectedPlatform.value = ''
  statusMessage.value = '正在启动本地浏览器...'
  qrImage.value = ''
  errorMessage.value = ''
  boundAccount.value = null
}

function handleSelectPlatform(platform: string) {
  selectedPlatform.value = platform
  step.value = 'scanning'
  startScan()
}

function startScan() {
  disconnectSSE()
  qrImage.value = ''
  statusMessage.value = '正在启动本地浏览器...'

  // 3 分钟超时
  scanTimeout = setTimeout(() => {
    errorMessage.value = '扫码超时，请重试'
    step.value = 'error'
    disconnectSSE()
  }, 180000)

  const flaskPlatform = PLATFORM_TO_FLASK[selectedPlatform.value] || selectedPlatform.value
  const token = userStore.token
  const apiUrl = import.meta.env.VITE_API_BASE_URL || `${window.location.origin}/api/v1`

  const params = new URLSearchParams({
    platform: flaskPlatform,
    token: token,
    api_url: apiUrl,
  })

  const url = `http://localhost:5409/api/scan-bind/start?${params.toString()}`

  eventSource = new EventSource(url)

  eventSource.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      switch (msg.type) {
        case 'qr_code':
          // 二维码可能是 base64 data URL 或普通 URL
          const raw = msg.data || ''
          if (raw.startsWith('data:') || raw.startsWith('http')) {
            qrImage.value = raw
          }
          statusMessage.value = '已获取二维码，请在本地浏览器窗口中扫码'
          break

        case 'status':
          statusMessage.value = msg.data || '处理中...'
          break

        case 'success':
          const nestjsResp = msg.data?.nestjs
          boundAccount.value = {
            nickname: msg.data?.nickname || '已绑定',
            platform: msg.data?.platform,
            avatar: nestjsResp?.data?.avatar,
          }
          step.value = 'success'
          disconnectSSE()
          break

        case 'error':
          errorMessage.value = msg.data || '扫码失败'
          step.value = 'error'
          disconnectSSE()
          break

        case 'heartbeat':
          // ignore
          break
      }
    } catch {
      // 非 JSON 消息忽略
    }
  }

  eventSource.onerror = () => {
    // SSE 连接失败 — 可能是本地 Flask 没启动
    if (step.value === 'scanning') {
      errorMessage.value = '无法连接本地扫码服务，请确认已运行 start-win.bat'
      step.value = 'error'
    }
    disconnectSSE()
  }
}

function handleCancel() {
  disconnectSSE()
  step.value = 'select'
}

function handleRetry() {
  step.value = 'scanning'
  startScan()
}

function handleDone() {
  emit('success')
  emit('update:visible', false)
}

function handleAddAnother() {
  resetState()
  step.value = 'select'
}

function handleClose() {
  disconnectSSE()
  emit('update:visible', false)
}

function disconnectSSE() {
  if (scanTimeout) {
    clearTimeout(scanTimeout)
    scanTimeout = null
  }
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}
</script>

<style lang="scss" scoped>
.scan-bind {
  &__tip {
    color: #606266;
    font-size: 14px;
    margin-bottom: 16px;
    text-align: center;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    padding: 8px 0;
  }

  &__platform-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px 12px;
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: #409eff;
      box-shadow: 0 2px 12px rgba(64, 158, 255, 0.15);
      transform: translateY(-2px);
    }
  }

  &__platform-icon {
    width: 44px;
    height: 44px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 18px;
    font-weight: bold;
  }

  &__platform-name {
    font-size: 13px;
    color: #303133;
  }

  &__scanning {
    text-align: center;
    padding: 16px 0;
  }

  &__status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 16px;
    color: #606266;
    font-size: 14px;
  }

  &__qr-container {
    width: 240px;
    height: 240px;
    margin: 0 auto 16px;
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: #fafafa;
  }

  &__qr-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  &__qr-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: #909399;
    font-size: 13px;
  }

  &__hint {
    color: #909399;
    font-size: 13px;
    margin-bottom: 16px;
  }

  &__actions {
    display: flex;
    justify-content: center;
    gap: 12px;
  }

  &__success {
    padding: 16px 0;
  }

  &__account-info {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: center;
    margin-top: 12px;
  }

  &__account-name {
    font-size: 16px;
    font-weight: 500;
    color: #303133;
  }

  &__account-platform {
    font-size: 13px;
    color: #909399;
    margin-top: 2px;
  }

  &__error {
    padding: 16px 0;
  }
}
</style>
