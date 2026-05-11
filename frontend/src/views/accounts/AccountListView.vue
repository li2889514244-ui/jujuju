<template>
  <div class="account-list">
    <!-- Filters -->
    <el-card shadow="hover" class="account-list__filter">
      <el-form :inline="true" :model="filter">
        <el-form-item label="平台">
          <el-select v-model="filter.platform" placeholder="全部平台" clearable style="width: 140px">
            <el-option label="全部" value="" />
            <el-option v-for="(label, key) in PLATFORM_LABELS" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="分组">
          <el-select v-model="filter.group" placeholder="全部分组" clearable style="width: 140px">
            <el-option label="全部" value="" />
            <el-option v-for="g in accountStore.groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="搜索">
          <el-input v-model="filter.keyword" placeholder="搜索账号名称" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>查询
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Action Bar -->
    <div class="account-list__actions">
      <el-button type="primary" @click="showAddDialog = true">
        <el-icon><Plus /></el-icon>扫码添加
      </el-button>
      <el-button @click="showGroupDialog = true">
        <el-icon><FolderAdd /></el-icon>新建分组
      </el-button>
      <el-button :disabled="!selectedIds.length" @click="handleBatchMove">
        <el-icon><FolderOpened /></el-icon>批量移动
      </el-button>
      <el-button type="danger" :disabled="!selectedIds.length" @click="handleBatchDelete">
        <el-icon><Delete /></el-icon>批量删除
      </el-button>
    </div>

    <!-- Table -->
    <el-card shadow="hover">
      <el-table
        v-loading="accountStore.loading"
        :data="accountStore.accounts"
        stripe
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="50" />
        <el-table-column label="平台" width="80">
          <template #default="{ row }">
            <PlatformIcon :platform="row.platform" />
          </template>
        </el-table-column>
        <el-table-column prop="nickname" label="账号名称" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="account-list__name">
              <el-avatar :size="32" :src="row.avatar">{{ row.nickname?.charAt(0) }}</el-avatar>
              <span>{{ row.nickname }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="groupName" label="分组" width="120" />
        <el-table-column label="Cookie状态" width="100">
          <template #default="{ row }">
            <StatusBadge :status="row.cookieStatus" type="cookie" size="small" />
          </template>
        </el-table-column>
        <el-table-column prop="followers" label="粉丝数" width="100" sortable>
          <template #default="{ row }">{{ formatNumber(row.followers) }}</template>
        </el-table-column>
        <el-table-column prop="likes" label="获赞数" width="100" sortable>
          <template #default="{ row }">{{ formatNumber(row.likes) }}</template>
        </el-table-column>
        <el-table-column prop="lastActiveAt" label="最近活跃" width="160">
          <template #default="{ row }">{{ formatTime(row.lastActiveAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="$router.push(`/accounts/${row.id}`)">详情</el-button>
            <el-button text type="warning" size="small" @click="handleCheckCookie(row.id)">检测</el-button>
            <el-button text type="danger" size="small" @click="handleDelete(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="account-list__pagination">
        <el-pagination
          v-model:current-page="filter.page"
          v-model:page-size="filter.pageSize"
          :total="accountStore.total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSearch"
          @current-change="handleSearch"
        />
      </div>
    </el-card>

    <!-- Group Dialog -->
    <el-dialog v-model="showGroupDialog" title="新建分组" width="400px">
      <el-form>
        <el-form-item label="分组名称">
          <el-input v-model="newGroupName" placeholder="请输入分组名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGroupDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateGroup">确定</el-button>
      </template>
    </el-dialog>

    <!-- Add Account Dialog (扫码绑定) -->
    <ScanBindDialog v-model:visible="showAddDialog" @success="handleBindSuccess" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/store/account'
import { accountsApi } from '@/api/accounts'
import { PLATFORM_LABELS } from '@/types'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import ScanBindDialog from '@/components/account/ScanBindDialog.vue'
import ManualAddDialog from '@/components/account/ManualAddDialog.vue'

const accountStore = useAccountStore()

const filter = reactive({
  platform: '',
  group: '',
  keyword: '',
  page: 1,
  pageSize: 20,
})

const selectedIds = ref<string[]>([])
const showGroupDialog = ref(false)
const newGroupName = ref('')
const showAddDialog = ref(false)
const showManualDialog = ref(false)

onMounted(() => {
  accountStore.fetchAccounts()
  accountStore.fetchGroups()
})

function handleSearch() {
  accountStore.setFilter(filter)
  accountStore.fetchAccounts()
}

function handleReset() {
  filter.platform = ''
  filter.group = ''
  filter.keyword = ''
  filter.page = 1
  handleSearch()
}

function handleSelectionChange(rows: { id: string }[]) {
  selectedIds.value = rows.map((r) => r.id)
}

async function handleCheckCookie(id: string) {
  try {
    const result = await accountStore.checkCookieStatus(id)
    ElMessage.success(`Cookie状态: ${result.status}`)
  } catch (e) {
    ElMessage.error('检测 Cookie 状态失败')
    console.error('Cookie 检测失败:', e)
  }
}

async function handleDelete(id: string) {
  await ElMessageBox.confirm('确定删除该账号？', '提示', { type: 'warning' })
  await accountStore.deleteAccount(id)
  ElMessage.success('删除成功')
}

async function handleBatchDelete() {
  await ElMessageBox.confirm(`确定删除选中的 ${selectedIds.value.length} 个账号？`, '提示', { type: 'warning' })
  const results = await Promise.allSettled(
    selectedIds.value.map((id) => accountsApi.delete(id))
  )
  const successCount = results.filter((r) => r.status === 'fulfilled').length
  const failCount = results.filter((r) => r.status === 'rejected').length
  if (failCount === 0) {
    ElMessage.success(`批量删除成功，共 ${successCount} 个`)
  } else {
    ElMessage.warning(`删除完成：成功 ${successCount} 个，失败 ${failCount} 个`)
  }
  accountStore.fetchAccounts()
}

async function handleBatchMove() {
  // Show group selection dialog in production
  ElMessage.info('请选择目标分组')
}

async function handleCreateGroup() {
  if (!newGroupName.value.trim()) {
    ElMessage.warning('请输入分组名称')
    return
  }
  await accountsApi.createGroup(newGroupName.value)
  showGroupDialog.value = false
  newGroupName.value = ''
  accountStore.fetchGroups()
  ElMessage.success('创建成功')
}

function handleBindSuccess() {
  ElMessage.success('账号绑定成功')
  accountStore.fetchAccounts()
}

function formatNumber(num: number) {
  if (num >= 10000) return (num / 10000).toFixed(1) + 'w'
  return num?.toLocaleString() || '0'
}

function formatTime(time: string) {
  return time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '-'
}
</script>

<style lang="scss" scoped>
.account-list {
  &__filter {
    margin-bottom: 16px;
  }

  &__actions {
    margin-bottom: 16px;
    display: flex;
    gap: 8px;
  }

  &__name {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__pagination {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
