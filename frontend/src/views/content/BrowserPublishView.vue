<template>
  <div class="browser-publish">
    <el-page-header @back="$router.back()" title="返回" class="browser-publish__header">
      <template #content>
        <span>浏览器发布监控</span>
      </template>
    </el-page-header>

    <el-row :gutter="20" class="browser-publish__content">
      <!-- Browser Preview -->
      <el-col :xs="24" :lg="16">
        <el-card shadow="hover">
          <template #header>
            <div class="browser-publish__toolbar">
              <el-input
                v-model="currentUrl"
                placeholder="输入URL"
                class="browser-publish__url-bar"
                @keyup.enter="handleNavigate"
              >
                <template #prepend>
                  <el-icon><Link /></el-icon>
                </template>
                <template #append>
                  <el-button @click="handleNavigate">前往</el-button>
                </template>
              </el-input>
              <el-button-group>
                <el-button @click="handleRefresh">
                  <el-icon><Refresh /></el-icon>
                </el-button>
                <el-button @click="handleScreenshot">
                  <el-icon><Camera /></el-icon>
                </el-button>
              </el-button-group>
            </div>
          </template>

          <div class="browser-publish__viewport">
            <div v-if="screenshotUrl" class="browser-publish__screenshot">
              <img :src="screenshotUrl" alt="浏览器截图" />
            </div>
            <el-empty v-else description="暂无截图" />
          </div>
        </el-card>
      </el-col>

      <!-- Control Panel -->
      <el-col :xs="24" :lg="8">
        <el-card shadow="hover">
          <template #header>操作面板</template>

          <!-- Session Info -->
          <el-descriptions :column="1" border size="small" class="browser-publish__info">
            <el-descriptions-item label="会话状态">
              <StatusBadge :status="session?.status || 'closed'" type="browser" />
            </el-descriptions-item>
            <el-descriptions-item label="Cookie状态">
              <StatusBadge :status="session?.cookieValid ? 'valid' : 'expired'" type="cookie" />
            </el-descriptions-item>
            <el-descriptions-item label="关联账号">
              {{ session?.accountNickname || '-' }}
            </el-descriptions-item>
          </el-descriptions>

          <el-divider />

          <!-- Quick Actions -->
          <div class="browser-publish__actions">
            <h4>快捷操作</h4>
            <el-button type="primary" block @click="handleAutoPublish" :loading="autoPublishing">
              自动发布
            </el-button>
            <el-button @click="handleFillForm">自动填写表单</el-button>
            <el-button @click="handleClickPublish">点击发布按钮</el-button>
          </div>

          <el-divider />

          <!-- Action Log -->
          <div class="browser-publish__log">
            <h4>操作日志</h4>
            <div class="browser-publish__log-list">
              <div v-for="action in actions" :key="action.id" class="browser-publish__log-item">
                <span class="browser-publish__log-time">{{ formatTime(action.createdAt) }}</span>
                <span class="browser-publish__log-action">{{ action.action }}</span>
                <StatusBadge :status="action.result === 'success' ? 'success' : 'failed'" type="publish" size="small" />
              </div>
              <el-empty v-if="!actions.length" description="暂无操作记录" :image-size="60" />
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { browserApi } from '@/api/browser'
import type { BrowserSession, BrowserAction } from '@/types'
import StatusBadge from '@/components/common/StatusBadge.vue'

const route = useRoute()

const sessionId = route.query.sessionId as string
const session = ref<BrowserSession | null>(null)
const currentUrl = ref('')
const screenshotUrl = ref('')
const autoPublishing = ref(false)
const actions = ref<BrowserAction[]>([])

onMounted(async () => {
  if (sessionId) {
    const res = await browserApi.getSession(sessionId)
    session.value = res.data
    currentUrl.value = ''
    await loadScreenshot()
    await loadActions()
  }
})

async function loadScreenshot() {
  if (!sessionId) return
  const res = await browserApi.getScreenshot(sessionId)
  screenshotUrl.value = res.data.screenshot
}

async function loadActions() {
  if (!sessionId) return
  const res = await browserApi.getActions(sessionId)
  actions.value = res.data.list
}

async function handleNavigate() {
  if (!sessionId || !currentUrl.value) return
  await browserApi.navigateTo(sessionId, currentUrl.value)
  await loadScreenshot()
  ElMessage.success('已导航')
}

async function handleRefresh() {
  await loadScreenshot()
}

async function handleScreenshot() {
  await loadScreenshot()
  ElMessage.success('截图已更新')
}

async function handleAutoPublish() {
  autoPublishing.value = true
  try {
    await browserApi.executeAction(sessionId, { type: 'auto_publish', target: 'publish_button' })
    await loadActions()
    ElMessage.success('自动发布完成')
  } catch {
    ElMessage.error('自动发布失败')
  } finally {
    autoPublishing.value = false
  }
}

async function handleFillForm() {
  await browserApi.executeAction(sessionId, { type: 'fill_form', target: 'content_form' })
  await loadActions()
  ElMessage.success('表单已填写')
}

async function handleClickPublish() {
  await browserApi.executeAction(sessionId, { type: 'click', target: 'publish_button' })
  await loadActions()
  ElMessage.success('已点击发布按钮')
}

function formatTime(time: string) {
  return dayjs(time).format('HH:mm:ss')
}
</script>

<style lang="scss" scoped>
.browser-publish {
  &__header {
    margin-bottom: 20px;
  }

  &__toolbar {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  &__url-bar {
    flex: 1;
  }

  &__viewport {
    min-height: 500px;
    background: #f5f7fa;
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__screenshot {
    width: 100%;

    img {
      width: 100%;
      display: block;
    }
  }

  &__info {
    margin-bottom: 0;
  }

  &__actions {
    h4 {
      margin-bottom: 12px;
      font-size: 14px;
      color: #303133;
    }

    .el-button {
      width: 100%;
      margin-left: 0;
      margin-bottom: 8px;
    }
  }

  &__log {
    h4 {
      margin-bottom: 12px;
      font-size: 14px;
      color: #303133;
    }
  }

  &__log-list {
    max-height: 300px;
    overflow-y: auto;
  }

  &__log-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;
    font-size: 13px;

    &:last-child {
      border-bottom: none;
    }
  }

  &__log-time {
    color: #909399;
    font-family: monospace;
    flex-shrink: 0;
  }

  &__log-action {
    flex: 1;
    color: #303133;
  }
}
</style>
