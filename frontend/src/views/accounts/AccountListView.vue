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
      <el-button @click="exportCSV" :disabled="enhancedAccounts.length === 0" style="margin-left:auto">
        <el-icon><Download /></el-icon>导出 CSV
      </el-button>
    </div>

    <!-- Table -->
    <el-card shadow="hover">
      <el-table
        v-loading="loading"
        :data="enhancedAccounts"
        stripe
        @selection-change="handleSelectionChange"
        :default-sort="{ prop: 'followers', order: 'descending' }"
      >
        <el-table-column type="selection" width="50" />
        <el-table-column label="平台" width="80">
          <template #default="{ row }">
            <PlatformIcon :platform="row.platform" />
          </template>
        </el-table-column>
        <el-table-column prop="nickname" label="账号名称" min-width="160" show-overflow-tooltip sortable="custom">
          <template #default="{ row }">
            <div class="account-list__name">
              <el-avatar :size="32" :src="row.avatar">{{ row.nickname?.charAt(0) }}</el-avatar>
              <span>{{ row.nickname }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="groupName" label="分组" width="110" />
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.hasCookies ? 'success' : 'warning'" size="small">
              {{ row.hasCookies ? '在线' : '待授权' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="followers" label="粉丝" width="90" sortable="custom" align="right">
          <template #default="{ row }">{{ formatNumber(row.followers) }}</template>
        </el-table-column>
        <el-table-column prop="dailyViews" label="播放量" width="100" sortable="custom" align="right">
          <template #default="{ row }">{{ formatNumber(row.dailyViews) }}</template>
        </el-table-column>
        <el-table-column prop="dailyLikes" label="点赞" width="90" sortable="custom" align="right">
          <template #default="{ row }">{{ formatNumber(row.dailyLikes) }}</template>
        </el-table-column>
        <el-table-column prop="dailyComments" label="评论" width="80" sortable="custom" align="right">
          <template #default="{ row }">{{ formatNumber(row.dailyComments) }}</template>
        </el-table-column>
        <el-table-column prop="postCount" label="内容" width="70" sortable="custom" align="right">
          <template #default="{ row }">{{ row.postCount || 0 }}</template>
        </el-table-column>
        <el-table-column prop="lastActiveAt" label="最近活跃" width="140">
          <template #default="{ row }">{{ formatTime(row.lastActiveAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="$router.push(`/accounts/${row.id}`)">详情</el-button>
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

    <!-- Add Account Guide Dialog -->
    <el-dialog v-model="showAddDialog" title="添加账号" width="500px">
      <div style="text-align:center;padding:20px">
        <p style="font-size:16px;margin-bottom:16px">请使用 <strong>披星云桌面伴侣</strong> 绑定账号</p>

        <!-- 已检测到桌面伴侣 -->
        <div v-if="companionOnline" style="background:#f0f9eb;border:1px solid #b3e19d;border-radius:8px;padding:16px;margin-bottom:16px">
          <p style="color:#67c23a;font-weight:600;margin-bottom:8px">已检测到桌面伴侣运行中</p>
          <p style="color:#666;font-size:13px;margin-bottom:12px">选择平台后，桌面伴侣会自动弹出浏览器窗口</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
            <el-button v-for="p in bindablePlatforms" :key="p.id" :type="p.type" size="small"
              @click="openCompanionScan(p.id)">
              {{ p.icon }} {{ p.name }}
            </el-button>
          </div>
        </div>

        <!-- 未检测到桌面伴侣 -->
        <template v-else>
          <el-button type="primary" size="large" style="margin-bottom:16px" tag="a"
            href="https://github.com/li2889514244-ui/pixingyun-desktop/archive/refs/heads/main.zip"
            target="_blank">
            <el-icon><Download /></el-icon>
            下载桌面伴侣
          </el-button>
          <div style="background:#f5f7fa;border-radius:8px;padding:16px;text-align:left;margin-bottom:16px">
            <p style="margin:4px 0">1. 下载并解压桌面伴侣</p>
            <p style="margin:4px 0">2. 双击 install.bat 一键安装</p>
            <p style="margin:4px 0">3. 双击 start.bat 启动，自动打开界面</p>
            <p style="margin:4px 0">4. 回到本页选择平台，扫码登录</p>
            <p style="margin:4px 0">5. Cookie 自动上传，刷新即可见</p>
          </div>
        </template>

        <p style="color:#909399;font-size:13px">
          桌面端使用你电脑的真实 IP 登录平台，不会触发风控封号。
        </p>
      </div>
      <template #footer>
        <el-button @click="showAddDialog = false">关闭</el-button>
        <el-button type="primary" @click="showManualDialog = true; showAddDialog = false">手动输入 Cookie</el-button>
      </template>
    </el-dialog>
    <!-- Manual Add Dialog -->
    <ManualAddDialog v-model:visible="showManualDialog" @success="handleBindSuccess" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAccountStore } from '@/store/account'
import { useUserStore } from '@/store/user'
import { accountsApi } from '@/api/accounts'
import { analyticsApi } from '@/api/analytics'
import { PLATFORM_LABELS } from '@/types'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import ManualAddDialog from '@/components/account/ManualAddDialog.vue'

const accountStore = useAccountStore()
const userStore = useUserStore()

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
const companionOnline = ref(false)
const loading = ref(false)
const dailyStatsMap = ref<Record<string, any>>({})
const bindablePlatforms = [
  { id: 'douyin', name: '抖音', icon: '🎵', type: 'primary' as const },
  { id: 'xiaohongshu', name: '小红书', icon: '📕', type: 'danger' as const },
  { id: 'kuaishou', name: '快手', icon: '🎬', type: 'warning' as const },
  { id: 'tencent', name: '视频号', icon: '📺', type: 'success' as const },
]

function checkCompanion() {
  fetch('http://localhost:5409/health')
    .then(r => r.json())
    .then(d => { if (d.status === 'ok') companionOnline.value = true })
    .catch(() => { companionOnline.value = false })
}

async function openCompanionScan(platform: string) {
  const token = userStore.token
  const api = 'https://ddddkiii.com/api/v1'
  try {
    // 先尝试 JSON trigger 端点（companion v2.3+）
    const resp = await fetch(`http://localhost:5409/api/scan-bind/trigger?platform=${platform}&token=${encodeURIComponent(token)}&api_url=${encodeURIComponent(api)}`)
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    const data = await resp.json()
    if (data.code === 0) {
      ElMessage.success('扫码窗口已打开，请在浏览器中扫码登录。登录成功后回到此页面刷新账号列表。')
    } else {
      ElMessage.error(data.msg || '发送失败')
    }
  } catch {
    ElMessage.error('桌面伴侣未启动，请先打开桌面伴侣')
  }
}

const enhancedAccounts = computed(() => {
  return accountStore.accounts.map((a: any) => {
    const daily = dailyStatsMap.value[a.id] || {}
    return {
      ...a,
      dailyViews: daily.views || 0,
      dailyLikes: daily.likes || 0,
      dailyComments: daily.comments || 0,
      dailyShares: daily.shares || 0,
      postCount: a._count?.posts || 0,
    }
  })
})

async function fetchDailyStats() {
  try {
    const res = await analyticsApi.getReport()
    const data = (res as any).data || res
    const accs = data?.accounts || []
    const map: Record<string, any> = {}
    for (const a of accs) {
      const stats = a.dailyStats?.[0]
      if (stats) {
        map[a.id] = {
          views: stats.views || 0,
          likes: stats.likes || 0,
          comments: stats.comments || 0,
          shares: stats.shares || 0,
        }
      }
    }
    dailyStatsMap.value = map
  } catch { /* silent */ }
}

onMounted(() => {
  accountStore.fetchAccounts()
  accountStore.fetchGroups()
  fetchDailyStats()
  checkCompanion()
  setInterval(checkCompanion, 5000)
})

async function handleSearch() {
  accountStore.setFilter(filter)
  await accountStore.fetchAccounts()
  await fetchDailyStats()
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

function exportCSV() {
  const headers = ['账号', '平台', '分组', '粉丝', '播放量', '点赞', '评论', '内容数', '状态']
  const rows = enhancedAccounts.value.map((r: any) => [
    r.nickname, r.platform, r.groupName || '-', r.followers, r.dailyViews, r.dailyLikes, r.dailyComments, r.postCount, r.hasCookies ? '在线' : '待授权'
  ])
  const csv = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `账号列表_${dayjs().format('YYYY-MM-DD')}.csv`; a.click()
  URL.revokeObjectURL(url)
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