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
      <p class="scan-bind__tip">选择要绑定的平台，系统将打开该平台登录页供您扫码</p>
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
        <el-icon v-if="scanStatus === 'launching' || scanStatus === 'navigating' || scanStatus === 'waiting_qr'" class="is-loading"><Loading /></el-icon>
        <span>{{ statusMessage }}</span>
      </div>

      <div class="scan-bind__qr-container">
        <img v-if="qrImage" :src="qrImage" class="scan-bind__qr-image" alt="扫码登录" />
        <div v-else class="scan-bind__qr-placeholder">
          <el-icon class="is-loading" :size="32"><Loading /></el-icon>
          <span>正在加载二维码...</span>
        </div>
      </div>

      <p class="scan-bind__hint">请使用「{{ selectedPlatformLabel }}」App 扫描上方二维码完成登录</p>

      <div class="scan-bind__actions">
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="warning" @click="handleRetry">重新获取</el-button>
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
import { io, Socket } from 'socket.io-client'
import { useUserStore } from '@/store/user'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'success': []
}>()

const userStore = useUserStore()

const platforms = [
  { value: 'DOUYIN', label: '抖音', icon: '抖', color: '#000000' },
  { value: 'XIAOHONGSHU', label: '小红书', icon: '红', color: '#FF2442' },
  { value: 'KUAISHOU', label: '快手', icon: '快', color: '#FF4906' },
  { value: 'BILIBILI', label: 'B站', icon: 'B', color: '#00A1D6' },
  { value: 'WEIBO', label: '微博', icon: '微', color: '#E6162D' },
  { value: 'WECHAT_VIDEO', label: '视频号', icon: '视', color: '#07C160' },
]

const step = ref<'select' | 'scanning' | 'success' | 'error'>('select')
const selectedPlatform = ref('')
const scanStatus = ref('')
const statusMessage = ref('')
const qrImage = ref('')
const errorMessage = ref('')
const boundAccount = ref<any>(null)

let socket: Socket | null = null
let scanTimeout: ReturnType<typeof setTimeout> | null = null

const selectedPlatformLabel = computed(() => {
  return platforms.find(p => p.value === selectedPlatform.value)?.label || ''
})

watch(() => props.visible, (val) => {
  if (val) {
    step.value = 'select'
    resetState()
  } else {
    disconnectSocket()
  }
})

onUnmounted(() => {
  disconnectSocket()
})

function resetState() {
  selectedPlatform.value = ''
  scanStatus.value = ''
  statusMessage.value = ''
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
  disconnectSocket()
  qrImage.value = ''
  scanStatus.value = 'launching'
  statusMessage.value = '正在启动浏览器...'

  // 2分钟超时
  scanTimeout = setTimeout(() => {
    errorMessage.value = '扫码超时，请重试'
    step.value = 'error'
    disconnectSocket()
  }, 120000)

  const baseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin
  const wsBase = baseUrl.replace(/\/api\/v1$/, '')
  socket = io(`${wsBase}/scan-bind`, {
    transports: ['websocket'],
    auth: {
      token: userStore.token,
    },
  })

  socket.on('connect', () => {
    socket!.emit('start-scan', {
      platform: selectedPlatform.value,
      userId: userStore.userInfo?.id,
    })
  })

  socket.on('qr-code', (data: { image: string }) => {
    qrImage.value = data.image
  })

  socket.on('scan-status', (data: { status: string; message?: string }) => {
    scanStatus.value = data.status
    statusMessage.value = data.message || ''
  })

  socket.on('scan-success', (data: any) => {
    boundAccount.value = data
    step.value = 'success'
    disconnectSocket()
  })

  socket.on('scan-error', (data: { error: string }) => {
    errorMessage.value = data.error
    step.value = 'error'
    disconnectSocket()
  })

  socket.on('connect_error', () => {
    errorMessage.value = '连接服务器失败，请检查网络'
    step.value = 'error'
  })
}

function handleCancel() {
  if (socket) {
    socket.emit('cancel-scan')
  }
  disconnectSocket()
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
  disconnectSocket()
  emit('update:visible', false)
}

function disconnectSocket() {
  if (scanTimeout) {
    clearTimeout(scanTimeout)
    scanTimeout = null
  }
  if (socket) {
    socket.emit('cancel-scan')
    socket.disconnect()
    socket = null
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
