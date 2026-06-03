<template>
  <div class="publish-wizard">
    <!-- Steps indicator -->
    <el-steps :active="step" align-center class="publish-wizard__steps">
      <el-step title="编辑内容" description="创作或选择已有内容" />
      <el-step title="选择账号" description="匹配平台与账号" />
      <el-step title="确认发布" description="预览并一键发布" />
    </el-steps>

    <!-- Step 1: Content Editor -->
    <div v-if="step === 0" class="publish-wizard__body">
      <el-card shadow="hover">
        <template #header>内容编辑</template>
        <el-tabs v-model="contentMode">
          <el-tab-pane label="选择已有内容" name="existing">
            <el-table
              :data="contentStore.contents"
              stripe
              highlight-current-row
              max-height="400"
              @current-change="selectContent"
            >
              <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
              <el-table-column prop="createdAt" label="创建时间" width="160">
                <template #default="{ row }">{{
                  dayjs(row.createdAt).format('YYYY-MM-DD HH:mm')
                }}</template>
              </el-table-column>
              <template #empty>
                <el-empty description="还没有内容">
                  <el-button type="primary" @click="contentMode = 'new'">新建内容</el-button>
                </el-empty>
              </template>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="新建内容" name="new">
            <el-form :model="contentForm" label-width="80px">
              <el-form-item label="标题">
                <el-input
                  v-model="contentForm.title"
                  placeholder="视频/图文标题"
                  maxlength="50"
                  show-word-limit
                />
              </el-form-item>
              <el-form-item label="描述">
                <el-input
                  v-model="contentForm.description"
                  type="textarea"
                  :rows="3"
                  placeholder="内容描述"
                  maxlength="500"
                  show-word-limit
                />
              </el-form-item>
              <el-form-item label="标签">
                <el-select
                  v-model="contentForm.tags"
                  multiple
                  filterable
                  allow-create
                  placeholder="输入标签"
                  style="width: 100%"
                />
              </el-form-item>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </el-card>
      <div class="publish-wizard__actions">
        <el-button @click="$router.push('/content')">去完整编辑器</el-button>
        <el-button
          type="primary"
          :disabled="!selectedContentId && contentMode === 'existing'"
          @click="step = 1"
        >
          下一步 <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- Step 2: Account Selection -->
    <div v-if="step === 1" class="publish-wizard__body">
      <el-card shadow="hover" class="publish-wizard__accounts-card">
        <template #header>
          <div class="step2-header">
            <span>选择发布平台与账号</span>
            <el-radio-group v-model="publishMode" size="small">
              <el-radio-button value="now">立即发布</el-radio-button>
              <el-radio-button value="scheduled">定时发布</el-radio-button>
            </el-radio-group>
          </div>
        </template>

        <el-collapse v-model="activePlatforms">
          <el-collapse-item v-for="p in platforms" :key="p.key" :name="p.key">
            <template #title>
              <div class="platform-title">
                <el-checkbox v-model="p.selected" :indeterminate="false" @click.stop>
                  <span style="font-weight: 600">{{ p.label }}</span>
                </el-checkbox>
              </div>
            </template>
            <div v-if="p.accounts.length > 0" class="account-list">
              <el-checkbox-group v-model="p.selectedAccounts">
                <div v-for="acc in p.accounts" :key="acc.id" class="account-item">
                  <el-checkbox :value="acc.id" :disabled="acc.cookieStatus !== 'valid'">
                    <div class="account-item__info">
                      <el-avatar :size="28" :src="acc.avatar">{{
                        acc.nickname?.charAt(0)
                      }}</el-avatar>
                      <span>{{ acc.nickname }}</span>
                      <span class="account-item__followers"
                        >{{ formatNum(acc.followers) }} 粉丝</span
                      >
                    </div>
                  </el-checkbox>
                  <!-- Per-account custom title -->
                  <el-input
                    v-model="customTitles[acc.id]"
                    size="small"
                    placeholder="可为此账号自定义标题"
                    style="width: 200px; margin-left: 12px"
                  />
                </div>
              </el-checkbox-group>
            </div>
            <div v-else class="account-list__empty">
              暂无{{ p.label }}账号 —
              <el-button text type="primary" size="small" @click="$router.push('/accounts')"
                >添加账号</el-button
              >
            </div>
          </el-collapse-item>
        </el-collapse>

        <el-form-item v-if="publishMode === 'scheduled'" label="发布时间" style="margin-top: 16px">
          <el-date-picker
            v-model="scheduledAt"
            type="datetime"
            placeholder="选择发布时间"
            format="YYYY-MM-DD HH:mm"
            style="width: 280px"
          />
        </el-form-item>
      </el-card>

      <div class="publish-wizard__actions">
        <el-button @click="step = 0"
          ><el-icon><ArrowLeft /></el-icon> 上一步</el-button
        >
        <el-button type="primary" :disabled="totalSelectedAccounts === 0" @click="step = 2">
          下一步 <el-icon><ArrowRight /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- Step 3: Review & Publish -->
    <div v-if="step === 2" class="publish-wizard__body">
      <el-card shadow="hover">
        <template #header>发布预览</template>

        <el-descriptions :column="2" border size="small" class="review-desc">
          <el-descriptions-item label="内容标题">{{
            contentForm.title || selectedContent?.title || '新内容'
          }}</el-descriptions-item>
          <el-descriptions-item label="发布方式">{{
            publishMode === 'now' ? '立即发布' : dayjs(scheduledAt).format('YYYY-MM-DD HH:mm')
          }}</el-descriptions-item>
          <el-descriptions-item label="目标账号"
            >{{ totalSelectedAccounts }} 个</el-descriptions-item
          >
        </el-descriptions>

        <div class="review-accounts">
          <el-tag
            v-for="acc in selectedAccountDetails"
            :key="acc.id"
            size="small"
            closable
            style="margin: 4px"
            @close="removeAccount(acc)"
          >
            {{ acc.nickname }} ({{ PLATFORM_LABELS[acc.platform] || acc.platform }})
          </el-tag>
        </div>
      </el-card>

      <div class="publish-wizard__actions">
        <el-button @click="step = 1"
          ><el-icon><ArrowLeft /></el-icon> 上一步</el-button
        >
        <el-button type="success" size="large" :loading="publishing" @click="doPublish">
          <el-icon><Promotion /></el-icon> 一键发布到 {{ totalSelectedAccounts }} 个账号
        </el-button>
      </div>

      <!-- Publish Status -->
      <el-card v-if="publishResults.length > 0" shadow="hover" class="publish-wizard__results">
        <template #header>发布状态</template>
        <div
          v-for="r in publishResults"
          :key="r.accountId"
          class="result-item"
          :class="'result-' + r.status"
        >
          <el-icon v-if="r.status === 'success'"><CircleCheckFilled /></el-icon>
          <el-icon v-else-if="r.status === 'failed'"><CircleCloseFilled /></el-icon>
          <span>{{ r.nickname }}</span>
          <span v-if="r.error" style="color: #ef4444; font-size: 13px">{{ r.error }}</span>
        </div>
        <!-- Retry failed items -->
        <div v-if="hasFailedItems" style="margin-top: 12px; text-align: center">
          <el-button type="warning" :loading="retrying" @click="retryFailed">
            重试失败项目 ({{ failedCount }})
          </el-button>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  Promotion,
  CircleCheckFilled,
  CircleCloseFilled,
} from '@element-plus/icons-vue'
import { useContentStore } from '@/store/content'
import { useAccountStore } from '@/store/account'
import { contentApi } from '@/api/content'
import { PLATFORM_LABELS as _PL } from '@/types'
import type { Content, Account, PublishTask } from '@/types'
const PLATFORM_LABELS: Record<string, string> = _PL

interface PublishResultItem {
  accountId: string
  status: string
  nickname: string
  error?: string | null
}

const contentStore = useContentStore()
const accountStore = useAccountStore()

const step = ref(0)
const publishMode = ref<'now' | 'scheduled'>('now')
const scheduledAt = ref('')
const contentMode = ref<'existing' | 'new'>('existing')
const publishing = ref(false)
const retrying = ref(false)
const activePlatforms = ref<string[]>([])
const customTitles = reactive<Record<string, string>>({})

const contentForm = reactive({ title: '', description: '', tags: [] as string[] })
const publishResults = ref<PublishResultItem[]>([])
const selectedContentId = ref('')
const selectedContent = ref<Content | null>(null)

const platformOrder = ['DOUYIN', 'KUAISHOU', 'XIAOHONGSHU', 'WECHAT_VIDEO', 'BILIBILI', 'WEIBO']

const platforms = computed(() => {
  const accs = accountStore.accounts
  const byPlatform: Record<string, Account[]> = {}
  for (const a of accs) {
    if (!byPlatform[a.platform]) byPlatform[a.platform] = []
    byPlatform[a.platform].push(a)
  }
  return platformOrder
    .filter((p) => byPlatform[p]?.length > 0)
    .map((p) => ({
      key: p,
      label: PLATFORM_LABELS[p] || p,
      selected: false,
      accounts: byPlatform[p] || [],
      selectedAccounts: [] as string[],
    }))
})

const totalSelectedAccounts = computed(() => {
  return platforms.value.reduce((sum, p) => sum + (p.selected ? p.selectedAccounts.length : 0), 0)
})

const hasFailedItems = computed(() => publishResults.value.some((r) => r.status === 'failed'))
const failedCount = computed(() => publishResults.value.filter((r) => r.status === 'failed').length)

const selectedAccountDetails = computed(() => {
  const result: Account[] = []
  for (const p of platforms.value) {
    for (const aid of p.selectedAccounts) {
      const acc = p.accounts.find((a) => a.id === aid)
      if (acc) result.push(acc)
    }
  }
  return result
})

function selectContent(row: Content | null) {
  selectedContentId.value = row?.id || ''
  selectedContent.value = row
}

function removeAccount(acc: Account) {
  const p = platforms.value.find((g) => g.key === acc.platform)
  if (p) p.selectedAccounts = p.selectedAccounts.filter((id: string) => id !== acc.id)
}

function formatNum(num: number): string {
  if (num >= 10000) return (num / 10000).toFixed(1) + 'w'
  return num?.toLocaleString() || '0'
}

async function doPublish() {
  publishing.value = true
  publishResults.value = []
  try {
    const accountIds = platforms.value.flatMap((p) => p.selectedAccounts)
    const res = await contentApi.publish({
      title: contentForm.title || selectedContent.value?.title || '新内容',
      content: contentForm.description || selectedContent.value?.description || '',
      accountIds,
      tags: contentForm.tags,
      publishAt: publishMode.value === 'scheduled' ? scheduledAt.value : undefined,
    })

    const data: PublishTask[] = res.data
    if (Array.isArray(data)) {
      publishResults.value = data.map((r) => ({
        accountId: r.accountId,
        status: r.status || 'success',
        nickname: r.accountNickname || '',
        error: r.errorMessage,
      }))
    } else {
      publishResults.value = accountIds.map((aid: string) => {
        const acc = selectedAccountDetails.value.find((a) => a.id === aid)
        return { accountId: aid, status: 'success', nickname: acc?.nickname || aid }
      })
    }
    ElMessage.success('发布完成')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误'
    ElMessage.error('发布失败: ' + msg)
    publishResults.value = [{ accountId: '', status: 'failed', nickname: '', error: msg }]
  } finally {
    publishing.value = false
  }
}

async function retryFailed() {
  const failedItems = publishResults.value.filter((r) => r.status === 'failed')
  const failedIds = failedItems.map((r) => r.accountId).filter(Boolean)
  if (failedIds.length === 0) return

  // Remove failed items from results before retrying
  publishResults.value = publishResults.value.filter((r) => r.status !== 'failed')
  retrying.value = true

  try {
    const res = await contentApi.publish({
      title: contentForm.title || selectedContent.value?.title || '新内容',
      content: contentForm.description || selectedContent.value?.description || '',
      accountIds: failedIds,
      tags: contentForm.tags,
      publishAt: publishMode.value === 'scheduled' ? scheduledAt.value : undefined,
    })

    const data: PublishTask[] = res.data
    if (Array.isArray(data)) {
      const newResults = data.map((r) => ({
        accountId: r.accountId,
        status: r.status || 'success',
        nickname: r.accountNickname || '',
        error: r.errorMessage,
      }))
      publishResults.value = [...publishResults.value, ...newResults]
    } else {
      const retryResults = failedIds.map((aid: string) => {
        const acc = selectedAccountDetails.value.find((a) => a.id === aid)
        return { accountId: aid, status: 'success', nickname: acc?.nickname || aid }
      })
      publishResults.value = [...publishResults.value, ...retryResults]
    }
    ElMessage.success(`重试完成：${failedIds.length} 个项目`)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '未知错误'
    ElMessage.error('重试失败: ' + msg)
    // Restore failed items on error
    publishResults.value = [...publishResults.value, ...failedItems]
  } finally {
    retrying.value = false
  }
}

onMounted(() => {
  contentStore.fetchContents()
  accountStore.fetchAccounts()
  // Default expand first platform
  if (platforms.value.length > 0) activePlatforms.value = [platforms.value[0].key]
})
</script>

<style lang="scss" scoped>
.publish-wizard {
  &__steps {
    margin-bottom: 28px;
  }
  &__body {
    max-width: 900px;
    margin: 0 auto;
  }
  &__actions {
    display: flex;
    justify-content: space-between;
    margin-top: 20px;
  }
  &__accounts-card {
    margin-bottom: 0;
  }
  &__results {
    margin-top: 20px;
  }
}

.step2-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.platform-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.account-list {
  display: flex;
  flex-direction: column;
  gap: $space-xs;
  padding: $space-xs 0;
  &__empty {
    padding: $space-md;
    text-align: center;
    color: $color-text-secondary;
  }
}
.account-item {
  display: flex;
  align-items: center;
  gap: $space-xs;
  padding: 4px 0;
  &__info {
    display: flex;
    align-items: center;
    gap: $space-xs;
  }
  &__followers {
    font-size: 13px;
    color: $color-text-secondary;
    margin-left: 4px;
  }
}
.review-desc {
  margin-bottom: $space-md;
}
.review-accounts {
  margin-top: $space-xs;
}
.result-item {
  display: flex;
  align-items: center;
  gap: $space-xs;
  padding: $space-xs 0;
  border-bottom: 1px solid $color-border;
  &.result-success {
    color: $color-success;
  }
  &.result-failed {
    color: $color-danger;
  }
}
</style>
