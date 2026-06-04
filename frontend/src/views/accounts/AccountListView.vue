<template>
  <div class="account-list">
    <div class="account-list__header">
      <div>
        <span class="section-label">账号矩阵</span>
        <h2>账号状态、分组和作品数据</h2>
        <p>点击账号详情，可查看单账号视频播放、点赞、评论、收藏和互动率。</p>
      </div>
      <router-link to="/data-center" class="account-list__header-link">查看矩阵数据</router-link>
    </div>

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
        <el-icon><Plus /></el-icon>接入账号
      </el-button>
      <el-button @click="showGroupDialog = true">
        <el-icon><FolderAdd /></el-icon>新建分组
      </el-button>
      <el-button @click="showGroupManage = true">
        <el-icon><Setting /></el-icon>管理分组
      </el-button>
      <el-tooltip :content="selectedIds.length ? '移动到分组' : '请先选择账号'" placement="top">
        <el-button :disabled="!selectedIds.length" @click="handleBatchMove">
          <el-icon><FolderOpened /></el-icon>批量移动
        </el-button>
      </el-tooltip>
      <el-tooltip :content="selectedIds.length ? '删除选中账号' : '请先选择账号'" placement="top">
        <el-button type="danger" :disabled="!selectedIds.length" @click="handleBatchDelete">
          <el-icon><Delete /></el-icon>批量删除
        </el-button>
      </el-tooltip>
      <el-tooltip
        :content="enhancedAccounts.length ? '导出为 CSV 文件' : '暂无账号数据'"
        placement="top"
      >
        <el-button :disabled="enhancedAccounts.length === 0" class="ml-auto" @click="exportCSV">
          <el-icon><Download /></el-icon>导出 CSV
        </el-button>
      </el-tooltip>
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
          <el-icon v-if="selectedIds.includes(acc.id)" :size="20" color="#c7ff45"
            ><CircleCheckFilled
          /></el-icon>
          <span v-else class="account-card__check-empty" />
        </div>
        <el-avatar
          :size="48"
          :src="acc.avatar"
          :style="{ background: acc.avatar ? '' : getPlatformColor(acc.platform), color: '#fff' }"
          >{{ acc.nickname?.charAt(0) }}</el-avatar
        >
        <div class="account-card__info">
          <span class="account-card__name">{{ acc.nickname }}</span>
          <PlatformBadge :platform="acc.platform" size="sm" />
        </div>
        <div class="account-card__stats">
          <span class="account-card__stat-value">{{ formatCompactNum(acc.followers || 0) }}</span>
          <span class="account-card__stat-label">粉丝</span>
        </div>
        <span v-if="acc.groupName" class="account-card__group">{{ acc.groupName }}</span>
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
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect
          x="8"
          y="12"
          width="48"
          height="40"
          rx="6"
          stroke="#c7ff45"
          stroke-width="2"
          fill="none"
        />
        <circle cx="32" cy="30" r="8" stroke="#c7ff45" stroke-width="2" fill="none" />
        <path
          d="M18 48c4-6 10-10 16-10s12 4 16 10"
          stroke="#c7ff45"
          stroke-width="2"
          fill="none"
          stroke-linecap="round"
        />
      </svg>
      <h3>连接你的第一个账号</h3>
      <p>绑定社交媒体账号，开始矩阵管理与数据分析</p>
    </div>

    <!-- 批量操作浮动栏 -->
    <div v-if="selectedIds.length > 0" class="float-bar">
      <span class="float-bar__count">已选 {{ selectedIds.length }} 个账号</span>
      <div class="float-bar__actions">
        <el-button size="small" @click="handleBatchMove"
          ><el-icon><FolderOpened /></el-icon>批量移动</el-button
        >
        <el-button size="small" type="danger" @click="handleBatchDelete"
          ><el-icon><Delete /></el-icon>批量删除</el-button
        >
      </div>
    </div>

    <div v-if="accountStore.total > accountStore.filter.pageSize" class="account-list__pagination">
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
    <el-dialog v-model="showAddDialog" title="接入账号" width="540px">
      <div class="add-dialog">
        <div class="add-dialog__intro">
          <p class="add-dialog__eyebrow">推荐方式</p>
          <p class="add-dialog__title">用桌面伴侣完成扫码登录</p>
          <p class="add-dialog__desc">
            桌面伴侣会在本机打开平台登录页，登录成功后自动同步账号状态。
          </p>
        </div>
        <div v-if="companionOnline" class="companion-online-box">
          <p class="companion-online-box__status">桌面伴侣已连接</p>
          <p class="companion-online-box__hint">选择要绑定的平台，随后在弹出的窗口里完成登录。</p>
          <div class="companion-online-box__btns">
            <el-button
              v-for="p in bindablePlatforms"
              :key="p.id"
              :type="p.type"
              size="small"
              @click="openCompanionScan(p.id)"
              >{{ p.icon }} {{ p.name }}</el-button
            >
          </div>
        </div>
        <template v-else>
          <div class="companion-offline-box">
            <p><strong>1. 下载并解压桌面伴侣</strong></p>
            <p>2. 双击 install.bat 完成安装</p>
            <p>3. 双击 start.bat 启动后回到这里</p>
            <p>4. 选择平台并扫码登录，账号会自动同步</p>
          </div>
          <el-button
            type="primary"
            size="large"
            class="download-btn"
            tag="a"
            href="https://github.com/li2889514244-ui/pixingyun-desktop/archive/refs/heads/main.zip"
            target="_blank"
          >
            <el-icon><Download /></el-icon>下载桌面伴侣
          </el-button>
        </template>
        <p class="text-caption">遇到特殊平台或调试场景时，也可以使用手动录入。</p>
      </div>
      <template #footer>
        <el-button @click="showAddDialog = false">关闭</el-button>
        <el-button @click="openManualAdd">手动录入</el-button>
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

function openManualAdd() {
  showManualDialog.value = true
  showAddDialog.value = false
}
</script>

<style lang="scss" scoped>
.account-list {
  display: flex;
  flex-direction: column;
  gap: $space-xl;

  &__header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: $space-lg;
    padding: 30px;
    border: 1px solid rgba($color-accent, 0.18);
    border-radius: $radius-xl;
    background:
      radial-gradient(circle at 8% 10%, rgba($color-accent, 0.16), transparent 34%),
      linear-gradient(135deg, rgba(243, 240, 223, 0.065), rgba(243, 240, 223, 0.012)),
      rgba(8, 11, 8, 0.72);
    box-shadow: $shadow-md;
    position: relative;
    overflow: hidden;

    &::after {
      content: '';
      position: absolute;
      right: -60px;
      bottom: -90px;
      width: 260px;
      height: 260px;
      border: 1px solid rgba($color-accent, 0.15);
      border-radius: 50%;
      pointer-events: none;
    }

    h2 {
      margin: 10px 0 10px;
      font-size: clamp(30px, 3vw, 44px);
      letter-spacing: -0.06em;
    }

    p {
      max-width: 620px;
      color: $color-text-secondary;
      margin: 0;
      font-size: 15px;
    }
  }

  &__header-link {
    position: relative;
    z-index: 1;
    padding: 11px 16px;
    border: 1px solid rgba($color-accent, 0.26);
    border-radius: $radius-full;
    background: rgba($color-accent, 0.08);
    color: $color-accent;
    font-size: $text-caption;
    font-weight: 820;
    white-space: nowrap;

    &:hover {
      color: #071008;
      background: $color-accent;
      border-color: $color-border-hover;
    }
  }

  &__filter {
    border-radius: $radius-lg;

    :deep(.el-form--inline .el-form-item) {
      margin-right: $space-sm;
    }
  }

  &__actions {
    display: flex;
    gap: $space-sm;
    flex-wrap: wrap;
    padding: $space-sm;
    border: 1px solid rgba(243, 240, 223, 0.08);
    border-radius: $radius-lg;
    background: rgba(8, 11, 8, 0.52);

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

@media (max-width: 768px) {
  .account-list__header {
    align-items: flex-start;
    flex-direction: column;
  }
}

// === Account card grid ===
.account-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: $space-lg;
}

.account-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  min-height: 282px;
  padding: 28px 22px 22px;
  background:
    linear-gradient(145deg, rgba(243, 240, 223, 0.06), rgba(243, 240, 223, 0.012)),
    rgba(13, 19, 15, 0.78);
  border: 1px solid rgba(243, 240, 223, 0.1);
  border-radius: $radius-xl;
  box-shadow: $shadow-sm;
  cursor: pointer;
  transition: all 0.25s $ease-out;
  text-align: center;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    right: 22px;
    left: 22px;
    height: 3px;
    background: linear-gradient(90deg, transparent, $color-accent, transparent);
    opacity: 0;
    transition: opacity 0.25s $ease-out;
  }

  &:hover {
    transform: translateY(-5px);
    border-color: $color-border-hover;
    box-shadow: $shadow-md;

    &::before {
      opacity: 1;
    }
  }

  &--selected {
    border-color: $color-accent;
    background:
      linear-gradient(145deg, rgba($color-accent, 0.12), rgba($color-accent-alt, 0.045)),
      rgba(13, 19, 15, 0.78);
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
    border: 2px solid rgba(243, 240, 223, 0.16);
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
    font-size: 17px;
    font-weight: 860;
    color: $color-text-primary;
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
    font-family: $font-mono;
    font-size: 34px;
    font-weight: 860;
    color: $color-accent;
    font-feature-settings: 'tnum';
    letter-spacing: -0.06em;
  }
  &__stat-label {
    font-size: $text-micro;
    color: $color-text-tertiary;
    font-weight: 760;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  &__group {
    font-size: $text-micro;
    color: $color-text-secondary;
    background: rgba(243, 240, 223, 0.07);
    border: 1px solid rgba(243, 240, 223, 0.08);
    padding: 3px 10px;
    border-radius: $radius-full;
  }
  &__status {
    font-size: $text-micro;
    font-weight: 820;
    padding: 4px 10px;
    border-radius: $radius-full;
    &.status--valid {
      background: rgba($color-success, 0.1);
      color: $color-success;
    }
    &.status--expiring_soon {
      background: rgba($color-warning, 0.15);
      color: $color-warning;
    }
    &.status--expired,
    &.status--unknown {
      background: rgba($color-danger, 0.1);
      color: $color-danger;
    }
  }
  &__actions {
    display: flex;
    gap: $space-xs;
    margin-top: auto;
  }
}

// === Add dialog ===
.add-dialog {
  display: flex;
  flex-direction: column;
  gap: $space-md;
  padding: $space-sm 0;
  .add-dialog__title {
    font-size: $text-title;
    color: $color-text-primary;
    font-weight: 700;
    margin: 0;
  }
  .add-dialog__eyebrow {
    color: $color-accent;
    font-size: $text-micro;
    font-weight: 700;
    letter-spacing: 0.08em;
    margin: 0 0 4px;
    text-transform: uppercase;
  }
  .add-dialog__desc {
    color: $color-text-secondary;
    font-size: $text-caption;
    margin: 6px 0 0;
  }
}
.companion-online-box {
  background: rgba(243, 240, 223, 0.055);
  border: 1px solid rgba(243, 240, 223, 0.09);
  border-radius: $radius-md;
  padding: $space-md;
  .companion-online-box__status {
    color: $color-success;
    font-weight: 600;
    margin-bottom: $space-sm;
  }
  .companion-online-box__hint {
    color: $color-text-secondary;
    font-size: $text-caption;
    margin-bottom: $space-sm;
  }
  .companion-online-box__btns {
    display: flex;
    gap: $space-sm;
    flex-wrap: wrap;
    justify-content: center;
  }
}
.companion-offline-box {
  background: rgba(243, 240, 223, 0.055);
  border: 1px solid rgba(243, 240, 223, 0.09);
  border-radius: $radius-md;
  padding: $space-md;
  text-align: left;
  p {
    margin: 4px 0;
    font-size: $text-caption;
    color: $color-text-secondary;
  }
}
.download-btn {
  margin-bottom: $space-md;
}

// === Float bar ===
.float-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: $space-lg;
  background: rgba(8, 11, 8, 0.92);
  border: 1px solid rgba($color-accent, 0.18);
  border-radius: $radius-lg;
  box-shadow: $shadow-lg;
  backdrop-filter: blur(18px);
  padding: $space-sm $space-lg;
  z-index: 100;
  &__count {
    font-size: $text-body;
    font-weight: 600;
    color: $color-text-primary;
  }
  &__actions {
    display: flex;
    gap: $space-sm;
  }
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
    color: $color-text-primary;
    margin: 0;
  }
  p {
    font-size: $text-body;
    color: $color-text-tertiary;
    margin: 0;
  }
}
</style>
