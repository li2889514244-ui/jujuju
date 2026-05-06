<template>
  <div class="publish">
    <el-card shadow="hover">
      <template #header>发布设置</template>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" class="publish__form">
        <!-- Content Selection -->
        <el-form-item label="选择内容" prop="contentId">
          <el-select v-model="form.contentId" placeholder="选择要发布的内容" style="width: 100%" filterable>
            <el-option
              v-for="content in contentStore.contents"
              :key="content.id"
              :label="content.title"
              :value="content.id"
            />
          </el-select>
        </el-form-item>

        <!-- Platform & Account Selection -->
        <el-form-item label="发布平台">
          <el-checkbox-group v-model="selectedPlatforms">
            <el-checkbox-button v-for="(label, key) in PLATFORM_LABELS" :key="key" :value="key">
              {{ label }}
            </el-checkbox-button>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="选择账号" prop="accountIds">
          <el-select
            v-model="form.accountIds"
            multiple
            placeholder="选择发布账号"
            style="width: 100%"
            collapse-tags
            collapse-tags-tooltip
          >
            <el-option
              v-for="acc in filteredAccounts"
              :key="acc.id"
              :label="`${acc.nickname} (${PLATFORM_LABELS[acc.platform]})`"
              :value="acc.id"
              :disabled="acc.cookieStatus !== 'valid'"
            />
          </el-select>
        </el-form-item>

        <!-- Schedule -->
        <el-form-item label="发布方式">
          <el-radio-group v-model="publishMode">
            <el-radio value="now">立即发布</el-radio>
            <el-radio value="scheduled">定时发布</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="publishMode === 'scheduled'" label="发布时间" prop="scheduledAt">
          <el-date-picker
            v-model="form.scheduledAt"
            type="datetime"
            placeholder="选择发布时间"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DDTHH:mm:ss"
            :disabled-date="disabledDate"
            style="width: 100%"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="publishing" @click="handlePublish">
            {{ publishMode === 'now' ? '立即发布' : '设置定时发布' }}
          </el-button>
          <el-button @click="$router.back()">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Recent Publish Tasks -->
    <el-card shadow="hover" class="publish__tasks">
      <template #header>
        <div class="publish__tasks-header">
          <span>发布任务</span>
          <el-button text type="primary" @click="contentStore.fetchPublishTasks()">刷新</el-button>
        </div>
      </template>
      <el-table :data="contentStore.publishTasks" stripe>
        <el-table-column prop="contentTitle" label="内容" min-width="180" show-overflow-tooltip />
        <el-table-column prop="accountNickname" label="账号" width="120" />
        <el-table-column label="平台" width="80">
          <template #default="{ row }">
            <PlatformIcon :platform="row.platform" />
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <StatusBadge :status="row.status" type="publish" size="small" />
          </template>
        </el-table-column>
        <el-table-column prop="scheduledAt" label="计划时间" width="160">
          <template #default="{ row }">
            {{ row.scheduledAt ? formatTime(row.scheduledAt) : '立即' }}
          </template>
        </el-table-column>
        <el-table-column prop="errorMessage" label="错误信息" min-width="150" show-overflow-tooltip />
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending'"
              text
              type="danger"
              size="small"
              @click="handleCancel(row.id)"
            >
              取消
            </el-button>
            <el-button
              v-if="row.status === 'failed'"
              text
              type="warning"
              size="small"
              @click="handleRetry(row.id)"
            >
              重试
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useContentStore } from '@/store/content'
import { useAccountStore } from '@/store/account'
import { contentApi } from '@/api/content'
import { PLATFORM_LABELS, type Platform } from '@/types'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'

const route = useRoute()
const contentStore = useContentStore()
const accountStore = useAccountStore()

const formRef = ref<FormInstance>()
const publishing = ref(false)
const publishMode = ref<'now' | 'scheduled'>('now')
const selectedPlatforms = ref<Platform[]>([])

const form = reactive({
  contentId: (route.query.contentId as string) || '',
  accountIds: [] as string[],
  scheduledAt: '',
})

const rules: FormRules = {
  contentId: [{ required: true, message: '请选择内容', trigger: 'change' }],
  accountIds: [{ required: true, message: '请选择至少一个账号', trigger: 'change' }],
}

// 使用 computed 保持响应性，当 store 中的 accounts 更新时自动同步
const filteredAccounts = computed(() => {
  if (selectedPlatforms.value.length === 0) {
    return accountStore.accounts
  }
  return accountStore.accounts.filter((a) =>
    selectedPlatforms.value.includes(a.platform)
  )
})

onMounted(() => {
  contentStore.fetchContents()
  contentStore.fetchPublishTasks()
  accountStore.fetchAccounts()
})

function disabledDate(date: Date) {
  return date.getTime() < Date.now() - 86400000
}

async function handlePublish() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  publishing.value = true
  try {
    await contentStore.publishContent(
      form.contentId,
      form.accountIds,
      publishMode.value === 'scheduled' ? form.scheduledAt : undefined
    )
    ElMessage.success(publishMode.value === 'now' ? '发布任务已创建' : '定时发布已设置')
  } catch (e) {
    ElMessage.error('发布失败')
    console.error('发布失败:', e)
  } finally {
    publishing.value = false
  }
}

async function handleCancel(taskId: string) {
  await contentStore.cancelPublish(taskId)
  ElMessage.success('已取消')
}

async function handleRetry(taskId: string) {
  await contentApi.retryPublish(taskId)
  contentStore.fetchPublishTasks()
  ElMessage.success('重试中')
}

function formatTime(time: string) {
  return time ? dayjs(time).format('MM-DD HH:mm') : '-'
}
</script>

<style lang="scss" scoped>
.publish {
  max-width: 900px;

  &__form {
    max-width: 700px;
  }

  &__tasks {
    margin-top: 20px;
  }

  &__tasks-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}
</style>
