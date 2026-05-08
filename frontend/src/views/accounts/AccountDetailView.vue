<template>
  <div v-loading="loading" class="account-detail">
    <!-- Back -->
    <el-page-header @back="$router.push('/accounts')" title="返回账号列表">
      <template #content>
        <span class="account-detail__title">{{ account?.nickname }}</span>
      </template>
    </el-page-header>

    <el-row :gutter="20" v-if="account" class="account-detail__content">
      <!-- Left: Info -->
      <el-col :xs="24" :lg="8">
        <el-card shadow="hover">
          <div class="account-detail__profile">
            <el-avatar :size="80" :src="account.avatar">{{ account.nickname?.charAt(0) }}</el-avatar>
            <h3>{{ account.nickname }}</h3>
            <div class="account-detail__platform">
              <PlatformIcon :platform="account.platform" show-label />
            </div>
            <StatusBadge :status="account.cookieStatus" type="cookie" />
          </div>

          <el-divider />

          <el-descriptions :column="1" border>
            <el-descriptions-item label="账号ID">{{ account.accountId }}</el-descriptions-item>
            <el-descriptions-item label="分组">{{ account.groupName || '未分组' }}</el-descriptions-item>
            <el-descriptions-item label="粉丝数">{{ account.followers?.toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="获赞数">{{ account.likes?.toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="最近活跃">{{ formatTime(account.lastActiveAt) }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatTime(account.createdAt) }}</el-descriptions-item>
          </el-descriptions>

          <div class="account-detail__actions">
            <el-button type="primary" @click="handleCheckCookie">检测Cookie</el-button>
            <el-button type="warning" @click="handleRefreshCookie">刷新Cookie</el-button>
            <el-button type="danger" @click="handleDelete">删除账号</el-button>
          </div>
        </el-card>
      </el-col>

      <!-- Right: History -->
      <el-col :xs="24" :lg="16">
        <el-card shadow="hover">
          <template #header>发布历史</template>
          <el-table :data="history" stripe v-loading="historyLoading">
            <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
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
            <el-table-column prop="createdAt" label="发布时间" width="160">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/store/account'
import { accountsApi } from '@/api/accounts'
import type { AccountHistory } from '@/types'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()

const loading = ref(false)
const historyLoading = ref(false)
const history = ref<AccountHistory[]>([])
// 使用 computed 保持响应性，避免 ref 捕获初始值导致 store 更新后视图不同步
const account = computed(() => accountStore.currentAccount)

const accountId = route.params.id as string

onMounted(async () => {
  loading.value = true
  try {
    await accountStore.fetchAccountDetail(accountId)

    historyLoading.value = true
    const res = await accountsApi.getHistory(accountId)
    history.value = res.data.list
  } finally {
    loading.value = false
    historyLoading.value = false
  }
})

async function handleCheckCookie() {
  const result = await accountStore.checkCookieStatus(accountId)
  ElMessage.success(`Cookie状态: ${result.status}`)
}

async function handleRefreshCookie() {
  ElMessage.info('正在刷新Cookie...')
  await accountsApi.refreshCookie(accountId)
  ElMessage.success('Cookie已刷新')
}

async function handleDelete() {
  await ElMessageBox.confirm('确定删除该账号？此操作不可恢复。', '警告', { type: 'warning' })
  await accountStore.deleteAccount(accountId)
  ElMessage.success('删除成功')
  router.push('/accounts')
}

function formatTime(time: string) {
  return time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '-'
}
</script>

<style lang="scss" scoped>
.account-detail {
  &__title {
    font-size: 18px;
    font-weight: 600;
  }

  &__content {
    margin-top: 20px;
  }

  &__profile {
    text-align: center;
    padding: 20px 0;

    h3 {
      margin: 12px 0 8px;
      font-size: 18px;
    }
  }

  &__platform {
    margin: 8px 0;
    display: flex;
    justify-content: center;
  }

  &__actions {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;

    .el-button {
      width: 100%;
    }
  }
}
</style>
