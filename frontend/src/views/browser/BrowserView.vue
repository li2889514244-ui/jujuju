<template>
  <div class="browser">
    <el-card shadow="hover">
      <template #header>
        <div class="browser__header">
          <span>浏览器管理</span>
          <div>
            <el-button type="primary" @click="showCreateDialog = true">
              <el-icon><Plus /></el-icon>新建会话
            </el-button>
            <el-button @click="refreshSessions">
              <el-icon><Refresh /></el-icon>刷新
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="sessions" stripe v-loading="loading">
        <el-table-column label="账号" min-width="180">
          <template #default="{ row }">
            <div class="browser__account">
              <PlatformIcon :platform="row.platform" />
              <span>{{ row.accountNickname }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="会话状态" width="100">
          <template #default="{ row }">
            <StatusBadge :status="row.status" type="browser" />
          </template>
        </el-table-column>
        <el-table-column label="Cookie状态" width="100">
          <template #default="{ row }">
            <StatusBadge :status="row.cookieValid ? 'valid' : 'expired'" type="cookie" />
          </template>
        </el-table-column>
        <el-table-column label="截图预览" width="120">
          <template #default="{ row }">
            <el-image
              v-if="row.lastScreenshot"
              :src="row.lastScreenshot"
              :preview-src-list="[row.lastScreenshot]"
              fit="cover"
              style="width: 80px; height: 50px; border-radius: 4px; cursor: pointer"
            />
            <span v-else class="browser__no-screenshot">无</span>
          </template>
        </el-table-column>
        <el-table-column prop="lastActiveAt" label="最近活跃" width="160">
          <template #default="{ row }">{{ formatTime(row.lastActiveAt) }}</template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openPublish(row.id)">发布监控</el-button>
            <el-button text type="warning" size="small" @click="handleRefreshSession(row.id)">刷新</el-button>
            <el-button text type="info" size="small" @click="handleScreenshot(row.id)">截图</el-button>
            <el-button text type="danger" size="small" @click="handleClose(row.id)">关闭</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Create Session Dialog -->
    <el-dialog v-model="showCreateDialog" title="新建浏览器会话" width="450px">
      <el-form label-width="80px">
        <el-form-item label="选择账号">
          <el-select v-model="newAccountId" placeholder="选择账号" style="width: 100%" filterable>
            <el-option
              v-for="acc in accountStore.accounts"
              :key="acc.id"
              :label="`${acc.nickname} (${PLATFORM_LABELS[acc.platform]})`"
              :value="acc.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { browserApi } from '@/api/browser'
import { useAccountStore } from '@/store/account'
import { PLATFORM_LABELS, type BrowserSession } from '@/types'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'

const router = useRouter()
const accountStore = useAccountStore()

const sessions = ref<BrowserSession[]>([])
const loading = ref(false)
const showCreateDialog = ref(false)
const creating = ref(false)
const newAccountId = ref('')

onMounted(async () => {
  await refreshSessions()
  accountStore.fetchAccounts()
})

async function refreshSessions() {
  loading.value = true
  try {
    const res = await browserApi.getSessions()
    sessions.value = res.data.list
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  if (!newAccountId.value) {
    ElMessage.warning('请选择账号')
    return
  }
  creating.value = true
  try {
    await browserApi.createSession(newAccountId.value)
    showCreateDialog.value = false
    newAccountId.value = ''
    await refreshSessions()
    ElMessage.success('会话已创建')
  } catch {
    // handled
  } finally {
    creating.value = false
  }
}

function openPublish(sessionId: string) {
  router.push(`/publish/browser?sessionId=${sessionId}`)
}

async function handleRefreshSession(id: string) {
  await browserApi.refreshSession(id)
  await refreshSessions()
  ElMessage.success('已刷新')
}

async function handleScreenshot(id: string) {
  const res = await browserApi.getScreenshot(id)
  // Open screenshot in new window or modal
  window.open(res.data.screenshot, '_blank')
}

async function handleClose(id: string) {
  await ElMessageBox.confirm('确定关闭该浏览器会话？', '提示', { type: 'warning' })
  await browserApi.closeSession(id)
  await refreshSessions()
  ElMessage.success('会话已关闭')
}

function formatTime(time: string) {
  return time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '-'
}
</script>

<style lang="scss" scoped>
.browser {
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__account {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__no-screenshot {
    color: #c0c4cc;
    font-size: 12px;
  }
}
</style>
