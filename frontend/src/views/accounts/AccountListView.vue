<template>
  <div class="account-list">
    <!-- Filters -->
    <GlassCard class="account-list__filter">
      <el-form :inline="true" :model="accountStore.filter">
        <el-form-item label="平台">
          <el-select
            v-model="accountStore.filter.platform"
            placeholder="全部平台"
            clearable
            style="width: 140px"
          >
            <el-option label="全部" value="" />
            <el-option
              v-for="(label, key) in PLATFORM_LABELS"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="分组">
          <el-select
            v-model="accountStore.filter.group"
            placeholder="全部分组"
            clearable
            style="width: 140px"
          >
            <el-option label="全部" value="" />
            <el-option v-for="g in accountStore.groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="搜索">
          <el-input
            v-model="accountStore.filter.keyword"
            placeholder="搜索账号名称"
            clearable
            style="width: 200px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>查询
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </GlassCard>

    <!-- Action Bar -->
    <div class="account-list__actions">
      <el-button type="primary" @click="showAddDialog = true">
        <el-icon><Plus /></el-icon>扫码添加
      </el-button>
      <el-button @click="showGroupDialog = true">
        <el-icon><FolderAdd /></el-icon>新建分组
      </el-button>
      <el-button @click="showGroupManage = true">
        <el-icon><Setting /></el-icon>管理分组
      </el-button>
      <el-button :disabled="!selectedIds.length" @click="handleBatchMove">
        <el-icon><FolderOpened /></el-icon>批量移动
      </el-button>
      <el-button type="danger" :disabled="!selectedIds.length" @click="handleBatchDelete">
        <el-icon><Delete /></el-icon>批量删除
      </el-button>
      <el-button @click="exportCSV" :disabled="enhancedAccounts.length === 0" class="ml-auto">
        <el-icon><Download /></el-icon>导出 CSV
      </el-button>
    </div>

    <!-- Account Card Grid -->
    <div v-loading="loading" class="account-grid">
      <div
        v-for="acc in enhancedAccounts"
        :key="acc.id"
        class="account-card"
        :class="{ 'account-card--selected': selectedIds.includes(acc.id) }"
        @click="toggleSelect(acc.id)"
      >
        <div class="account-card__check">
          <el-icon :size="20" v-if="selectedIds.includes(acc.id)" color="#d49b50"
            ><CircleCheckFilled
          /></el-icon>
          <span v-else class="account-card__check-empty" />
        </div>
        <el-avatar :size="48" :src="acc.avatar" :style="{ background: acc.avatar ? '' : getPlatformColor(acc.platform), color: '#fff' }">{{ acc.nickname?.charAt(0) }}</el-avatar>
        <div class="account-card__info">
          <span class="account-card__name">{{ acc.nickname }}</span>
          <PlatformBadge :platform="acc.platform" size="sm" />
        </div>
        <div class="account-card__stats">
          <span class="account-card__stat-value">{{ formatCompactNum(acc.followers || 0) }}</span>
          <span class="account-card__stat-label">粉丝</span>
        </div>
        <span class="account-card__group" v-if="acc.groupName">{{ acc.groupName }}</span>
        <span class="account-card__status" :class="'status--' + (acc.tokenStatus || 'unknown')">
          {{ tokenStatusLabel(acc) }}
        </span>
        <div class="account-card__actions">
          <el-button
            text
            type="primary"
            size="small"
            @click.stop="$router.push(`/accounts/${acc.id}`)"
            >详情</el-button
          >
          <el-button text type="danger" size="small" @click.stop="handleDelete(acc.id)"
            >删除</el-button
          >
        </div>
      </div>
    </div>

    <div v-if="enhancedAccounts.length === 0 && !loading" class="empty-state">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="8" y="12" width="48" height="40" rx="6" stroke="#d49b50" stroke-width="2" fill="none"/><circle cx="32" cy="30" r="8" stroke="#d49b50" stroke-width="2" fill="none"/><path d="M18 48c4-6 10-10 16-10s12 4 16 10" stroke="#d49b50" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
      <h3>连接你的第一个账号</h3>
      <p>绑定社交媒体账号，开始矩阵管理与数据分析</p>
    </div>

    <!-- 批量操作浮动栏 -->
    <div class="float-bar" v-if="selectedIds.length > 0">
      <span class="float-bar__count">已选 {{ selectedIds.length }} 个账号</span>
      <div class="float-bar__actions">
        <el-button size="small" @click="handleBatchMove"><el-icon><FolderOpened /></el-icon>批量移动</el-button>
        <el-button size="small" type="danger" @click="handleBatchDelete"><el-icon><Delete /></el-icon>批量删除</el-button>
      </div>
    </div>

    <div class="account-list__pagination" v-if="accountStore.total > accountStore.filter.pageSize">
      <el-pagination
        v-model:current-page="accountStore.filter.page"
        v-model:page-size="accountStore.filter.pageSize"
        :total="accountStore.total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSearch"
        @current-change="handleSearch"
      />
    </div>

    <!-- Group Dialog -->
    <el-dialog v-model="showGroupDialog" title="新建分组" width="400px">
      <el-form>
        <el-form-item label="分组名称">
          <el-input
            v-model="newGroupName"
            placeholder="请输入分组名称"
            @keyup.enter="handleCreateGroup"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGroupDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateGroup">确定</el-button>
      </template>
    </el-dialog>

    <!-- Move Dialog -->
    <el-dialog v-model="showMoveDialog" title="移动到分组" width="400px">
      <el-form>
        <el-form-item label="目标分组">
          <el-select v-model="moveTargetGroup" placeholder="选择分组" style="width: 100%">
            <el-option v-for="g in accountStore.groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showMoveDialog = false">取消</el-button>
        <el-button type="primary" @click="handleConfirmMove">确定移动</el-button>
      </template>
    </el-dialog>

    <!-- Group Management Dialog -->
    <el-dialog v-model="showGroupManage" title="管理分组" width="400px">
      <el-table :data="accountStore.groups" stripe size="small">
        <el-table-column prop="name" label="分组名称" />
        <el-table-column prop="_count.accounts" label="账号数" width="80" />
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-popconfirm title="确定删除此分组？" @confirm="handleDeleteGroup(row.id)">
              <template #reference>
                <el-button text type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="showGroupManage = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- Add Account Guide Dialog -->
    <el-dialog v-model="showAddDialog" title="添加账号" width="500px">
      <div class="add-dialog">
        <p class="add-dialog__title">请使用 <strong>披星云桌面伴侣</strong> 绑定账号</p>
        <div v-if="companionOnline" class="companion-online-box">
          <p class="companion-online-box__status">已检测到桌面伴侣运行中</p>
          <p class="companion-online-box__hint">选择平台后，桌面伴侣会自动弹出浏览器窗口</p>
          <div class="companion-online-box__btns">
            <el-button v-for="p in bindablePlatforms" :key="p.id" :type="p.type" size="small" @click="openCompanionScan(p.id)">{{ p.icon }} {{ p.name }}</el-button>
          </div>
        </div>
        <template v-else>
          <el-button type="primary" size="large" class="download-btn" tag="a" href="https://github.com/li2889514244-ui/pixingyun-desktop/archive/refs/heads/main.zip" target="_blank">
            <el-icon><Download /></el-icon>下载桌面伴侣
          </el-button>
          <div class="companion-offline-box">
            <p>1. 下载并解压桌面伴侣</p>
            <p>2. 双击 install.bat 一键安装</p>
            <p>3. 双击 start.bat 启动，自动打开界面</p>
            <p>4. 回到本页选择平台，扫码登录</p>
            <p>5. Cookie 自动上传，刷新即可见</p>
          </div>
        </template>
        <p class="text-caption">桌面端使用你电脑的真实 IP 登录平台，不会触发风控封号。</p>
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
import { ref, onMounted, computed } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheckFilled } from '@element-plus/icons-vue'
import { useAccountStore } from '@/store/account'
import { useUserStore } from '@/store/user'
import { accountsApi } from '@/api/accounts'
import { PLATFORM_LABELS } from '@/types'
import GlassCard from '@/components/common/GlassCard.vue'
import PlatformBadge from '@/components/common/PlatformBadge.vue'
import ManualAddDialog from '@/components/account/ManualAddDialog.vue'
import { formatCompactNum, tokenStatusLabel } from '@/utils/format'
import { getPlatformColor } from '@/composables/usePlatform'
import { useCompanionUrl } from '@/composables/useCompanionUrl'

const accountStore = useAccountStore()
const userStore = useUserStore()

const selectedIds = ref<string[]>([])
const showGroupDialog = ref(false)
const newGroupName = ref('')
const showMoveDialog = ref(false)
const moveTargetGroup = ref('')
const showGroupManage = ref(false)
const showAddDialog = ref(false)
const showManualDialog = ref(false)
const companionOnline = ref(false)
const loading = ref(false)
const bindablePlatforms = [
  { id: 'douyin', name: '抖音', icon: '🎵', type: 'primary' as const },
  { id: 'xiaohongshu', name: '小红书', icon: '📕', type: 'danger' as const },
  { id: 'kuaishou', name: '快手', icon: '🎬', type: 'warning' as const },
  { id: 'tencent', name: '视频号', icon: '📺', type: 'success' as const },
]

const { healthCheck } = useCompanionUrl()

async function checkCompanion() {
  const url = await healthCheck()
  if (url) {
    fetch(`${url}/health`)
      .then((r) => r.json())
      .then((d) => {
        if (d.status === 'ok') companionOnline.value = true
      })
      .catch(() => {
        companionOnline.value = false
      })
  } else {
    companionOnline.value = false
  }
}

async function openCompanionScan(platform: string) {
  const token = userStore.token
  const api = import.meta.env.VITE_API_BASE_URL || '/api/v1'
  const companionUrl = await healthCheck()
  if (!companionUrl) {
    ElMessage.error('桌面伴侣未启动，请先打开桌面伴侣')
    return
  }
  try {
    const resp = await fetch(`${companionUrl}/api/scan-bind/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, token, api_url: api }),
    })
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

const enhancedAccounts = computed(() => accountStore.accounts)

onMounted(() => {
  accountStore.fetchAccounts()
  accountStore.fetchGroups()
  checkCompanion()
})

async function handleSearch() {
  accountStore.setFilter(accountStore.filter)
  await accountStore.fetchAccounts()
}

function handleReset() {
  accountStore.filter.platform = ''
  accountStore.filter.group = ''
  accountStore.filter.keyword = ''
  accountStore.filter.page = 1
  handleSearch()
}

function toggleSelect(id: string) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1)
  } else {
    selectedIds.value.push(id)
  }
}

async function handleDelete(id: string) {
  await ElMessageBox.confirm('确定删除该账号？', '提示', { type: 'warning' })
  await accountStore.deleteAccount(id)
  ElMessage.success('删除成功')
}

async function handleBatchDelete() {
  await ElMessageBox.confirm(`确定删除选中的 ${selectedIds.value.length} 个账号？`, '提示', {
    type: 'warning',
  })
  const results = await Promise.allSettled(selectedIds.value.map((id) => accountsApi.delete(id)))
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
  if (!selectedIds.value.length) {
    ElMessage.warning('请先选择账号')
    return
  }
  moveTargetGroup.value = ''
  showMoveDialog.value = true
}

async function handleConfirmMove() {
  if (!moveTargetGroup.value) {
    ElMessage.warning('请选择目标分组')
    return
  }
  try {
    await accountsApi.moveToGroup(selectedIds.value, moveTargetGroup.value)
    showMoveDialog.value = false
    selectedIds.value = []
    await accountStore.fetchAccounts()
    ElMessage.success('移动成功')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '移动失败')
  }
}

async function handleCreateGroup() {
  if (!newGroupName.value.trim()) {
    ElMessage.warning('请输入分组名称')
    return
  }
  try {
    await accountsApi.createGroup(newGroupName.value.trim())
    showGroupDialog.value = false
    newGroupName.value = ''
    await accountStore.fetchGroups()
    ElMessage.success('创建成功')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || e?.message || '创建失败')
  }
}

function exportCSV() {
  const headers = ['账号', '平台', '分组', '状态']
  const rows = enhancedAccounts.value.map((r: any) => [
    r.nickname,
    r.platform,
    r.groupName || '-',
    r.tokenStatus === 'valid'
      ? '已连接'
      : r.tokenStatus === 'expiring_soon'
        ? '即将过期'
        : r.tokenStatus === 'expired'
          ? '已失效'
          : r.hasCookies
            ? '在线'
            : '待授权',
  ])
  const csv = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `账号列表_${dayjs().format('YYYY-MM-DD')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

async function handleDeleteGroup(id: string) {
  try {
    await accountsApi.deleteGroup(id)
    await accountStore.fetchGroups()
    ElMessage.success('分组已删除')
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败')
  }
}

function handleBindSuccess() {
  ElMessage.success('账号绑定成功')
  accountStore.fetchAccounts()
}
</script>

<style lang="scss" scoped>
.account-list {
  display: flex;
  flex-direction: column;
  gap: $section-gap;

  &__filter {
    :deep(.el-form--inline .el-form-item) {
      margin-right: $space-sm;
    }
  }

  &__actions {
    display: flex;
    gap: $space-sm;
    flex-wrap: wrap;
    .ml-auto {
      margin-left: auto;
    }
  }

  &__pagination {
    display: flex;
    justify-content: center;
    padding-top: $space-lg;
  }
}

// === Account card grid ===
.account-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: $space-md;
}

.account-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $space-sm;
  padding: 24px $space-md;
  background: var(--el-fill-color-light);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--el-border-color);
  border-radius: $radius-lg;
  cursor: pointer;
  transition: all 0.25s $ease-out;
  text-align: center;
  position: relative;

  &:hover {
    transform: translateY(-2px);
    border-color: var(--el-border-color);
    box-shadow: var(--el-box-shadow);
  }

  &--selected {
    border-color: #d49b50;
    background: rgba(#d49b50, 0.06);
  }

  &__check {
    position: absolute;
    top: $space-sm;
    right: $space-sm;
  }
  &__check-empty {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid var(--el-border-color);
    display: block;
  }

  &__info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
    width: 100%;
  }
  &__name {
    font-size: $text-body;
    font-weight: 600;
    color: var(--el-text-color-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  &__stats {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0;
  }
  &__stat-value {
    font-size: $text-headline;
    font-weight: 700;
    color: var(--el-text-color-primary);
    font-feature-settings: 'tnum';
  }
  &__stat-label {
    font-size: $text-micro;
    color: var(--el-text-color-placeholder);
    text-transform: uppercase;
  }
  &__group {
    font-size: $text-micro;
    color: var(--el-text-color-placeholder);
    background: var(--el-fill-color-lighter);
    padding: 1px 10px;
    border-radius: $radius-full;
  }
  &__status {
    font-size: $text-micro;
    font-weight: 500;
    padding: 2px 10px;
    border-radius: $radius-full;
    &.status--valid {
      background: rgba(#6b9e6c, 0.1);
      color: #6b9e6c;
    }
    &.status--expiring_soon {
      background: rgba(224, 160, 48, 0.15);
      color: #f0c060;
    }
    &.status--expired,
    &.status--unknown {
      background: rgba(#d4534a, 0.1);
      color: #d4534a;
    }
  }
  &__actions {
    display: flex;
    gap: $space-xs;
    margin-top: 2px;
  }
}

// === Add dialog ===
.add-dialog {
  text-align: center; padding: $space-lg;
  .add-dialog__title { font-size: $text-title; margin-bottom: $space-md; }
}
.companion-online-box {
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color);
  border-radius: $radius-sm;
  padding: $space-md;
  margin-bottom: $space-md;
  .companion-online-box__status { color: #34C759; font-weight: 600; margin-bottom: $space-sm; }
  .companion-online-box__hint { color: var(--el-text-color-secondary); font-size: $text-caption; margin-bottom: $space-sm; }
  .companion-online-box__btns { display: flex; gap: $space-sm; flex-wrap: wrap; justify-content: center; }
}
.companion-offline-box {
  background: var(--el-fill-color-lighter);
  border-radius: $radius-sm;
  padding: $space-md;
  text-align: left;
  margin-bottom: $space-md;
  p { margin: 4px 0; font-size: $text-caption; color: var(--el-text-color-secondary); }
}
.download-btn { margin-bottom: $space-md; }

// === Float bar ===
.float-bar {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: $space-lg;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: $radius-lg;
  box-shadow: var(--el-box-shadow-dark);
  padding: $space-sm $space-lg;
  z-index: 100;
  &__count { font-size: $text-body; font-weight: 600; color: var(--el-text-color-primary); }
  &__actions { display: flex; gap: $space-sm; }
}

// === Empty state ===
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: $space-md;
  padding: $space-4xl 0;
  text-align: center;
  h3 {
    font-size: $text-headline;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin: 0;
  }
  p {
    font-size: $text-body;
    color: var(--el-text-color-placeholder);
    margin: 0;
  }
}
</style>
