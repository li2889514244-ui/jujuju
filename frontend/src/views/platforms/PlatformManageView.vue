<template>
  <div class="platform-manage">
    <!-- 页面头部 -->
    <div class="page-header">
      <div class="header-left">
        <h2>平台管理</h2>
        <span class="subtitle">管理已授权的第三方平台账号</span>
      </div>
      <div class="header-actions">
        <el-tooltip v-if="!hasOAuthAccounts" content="视频号通过扫码登录，无需刷新Token" placement="bottom">
          <el-button disabled>
            <el-icon><Refresh /></el-icon>
            刷新Token
          </el-button>
        </el-tooltip>
        <el-button v-else @click="refreshAllTokens" :loading="refreshing">
          <el-icon><Refresh /></el-icon>
          刷新Token
        </el-button>
      </div>
    </div>

    <!-- 平台概览卡片 -->
    <div class="platform-stats">
      <el-row :gutter="16">
        <el-col :span="4" v-for="stat in platformStats" :key="stat.platform">
          <el-card shadow="hover" class="stat-card" :class="{ active: stat.count > 0 }">
            <div class="stat-icon">
              <PlatformIcon :platform="stat.platform" :size="32" />
            </div>
            <div class="stat-info">
              <div class="stat-name">{{ stat.name }}</div>
              <div class="stat-count">{{ stat.count }} 个账号</div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-select v-model="filterPlatform" placeholder="选择平台" clearable @change="loadAccounts">
        <el-option label="全部平台" value="" />
        <el-option
          v-for="p in supportedPlatforms"
          :key="p.key"
          :label="p.name"
          :value="p.key"
        />
      </el-select>
      <el-input
        v-model="searchKeyword"
        placeholder="搜索账号名称..."
        prefix-icon="Search"
        clearable
        style="width: 240px; margin-left: 12px"
      />
    </div>

    <!-- 已授权账号列表 -->
    <el-table
      :data="filteredAccounts"
      v-loading="loading"
      stripe
      style="width: 100%"
    >
      <el-table-column label="平台" width="100">
        <template #default="{ row }">
          <div class="platform-cell">
            <PlatformIcon :platform="row.platform" :size="20" />
            <span>{{ getPlatformName(row.platform) }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="账号" min-width="200">
        <template #default="{ row }">
          <div class="account-cell">
            <el-avatar :src="row.avatar" :size="36">{{ row.nickname?.[0] }}</el-avatar>
            <div class="account-info">
              <div class="nickname">{{ row.nickname }}</div>
              <div class="uid">UID: {{ row.platformUserId }}</div>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="粉丝数" width="120" sortable>
        <template #default="{ row }">
          <span class="metric">{{ formatNumber(row.followers) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="关注数" width="120" sortable>
        <template #default="{ row }">
          <span class="metric">{{ formatNumber(row.following) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="Token状态" width="140">
        <template #default="{ row }">
          <el-tag v-if="isCookiePlatform(row.platform)" type="info" size="small">扫码登录</el-tag>
          <el-tag v-else :type="getTokenStatusType(row.tokenStatus)" size="small">
            {{ getTokenStatusText(row.tokenStatus) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <StatusBadge :status="row.status === 'ACTIVE' ? 'active' : 'inactive'" />
        </template>
      </el-table-column>

      <el-table-column label="最近活跃" width="160">
        <template #default="{ row }">
          <span class="time-text">
            {{ row.lastActiveAt ? formatDate(row.lastActiveAt) : '—' }}
          </span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="collectData(row)" :loading="row._collecting">
            采集数据
          </el-button>
          <el-button
            v-if="!isCookiePlatform(row.platform)"
            size="small"
            type="warning"
            @click="refreshToken(row)"
            :loading="row._refreshing"
            :disabled="row.tokenStatus === 'valid'"
          >
            刷新Token
          </el-button>
          <el-popconfirm
            title="确定解除该平台的授权？"
            confirm-button-text="确定"
            cancel-button-text="取消"
            @confirm="revokeAuth(row)"
          >
            <template #reference>
              <el-button size="small" type="danger">解绑</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-wrapper" v-if="total > pageSize">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="loadAccounts"
      />
    </div>

    <!-- 添加平台弹窗 -->
    <el-dialog v-model="addDialogVisible" title="添加平台授权" width="480px">
      <div class="platform-grid">
        <div
          v-for="platform in availablePlatforms"
          :key="platform.key"
          class="platform-option"
          :class="{ authorized: isAuthorized(platform.key) }"
          @click="authorizePlatform(platform)"
        >
          <PlatformIcon :platform="(platform.key as Platform)" :size="40" />
          <div class="platform-name">{{ platform.name }}</div>
          <el-tag v-if="isAuthorized(platform.key)" type="success" size="small">已授权</el-tag>
          <el-tag v-else type="info" size="small">未授权</el-tag>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { platformsApi, type SupportedPlatform, type AuthorizedAccount } from '@/api/platforms'
import type { Platform } from '@/types'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'

// ==================== 常量 ====================
// Platforms that use cookies (QR scan) instead of OAuth tokens
const COOKIE_ONLY_PLATFORMS = new Set(['WECHAT_VIDEO'])
function isCookiePlatform(platform: string): boolean {
  return COOKIE_ONLY_PLATFORMS.has(platform)
}

// ==================== 状态 ====================
const loading = ref(false)
const refreshing = ref(false)
const addDialogVisible = ref(false)
const supportedPlatforms = ref<SupportedPlatform[]>([])
interface AuthorizedAccountWithState extends AuthorizedAccount {
  _collecting?: boolean
  _refreshing?: boolean
}

const accounts = ref<AuthorizedAccountWithState[]>([])
const filterPlatform = ref('')
const searchKeyword = ref('')
const currentPage = ref(1)
const pageSize = 20
const total = ref(0)

// ==================== 计算属性 ====================
const hasOAuthAccounts = computed(() =>
  accounts.value.some((a) => !isCookiePlatform(a.platform)),
)

const filteredAccounts = computed(() => {
  let list = accounts.value
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(
      (a) =>
        a.nickname.toLowerCase().includes(kw) ||
        a.platformUserId.includes(kw),
    )
  }
  return list
})

const platformStats = computed(() => {
  const countMap: Record<string, number> = {}
  accounts.value.forEach((a) => {
    countMap[a.platform] = (countMap[a.platform] || 0) + 1
  })
  return supportedPlatforms.value.map((p) => ({
    platform: p.key as Platform,
    name: p.name,
    count: countMap[p.key] || 0,
  }))
})

const availablePlatforms = computed(() => supportedPlatforms.value)

// ==================== 方法 ====================
function getPlatformName(key: string): string {
  return supportedPlatforms.value.find((p) => p.key === key)?.name || key
}

function isAuthorized(key: string): boolean {
  return accounts.value.some((a) => a.platform === key && a.status === 'ACTIVE')
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  return d.toLocaleDateString('zh-CN')
}

function getTokenStatusType(status: string): 'success' | 'warning' | 'danger' | 'info' {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
    valid: 'success',
    expiring_soon: 'warning',
    expired: 'danger',
    unknown: 'info',
  }
  return map[status] || 'info'
}

function getTokenStatusText(status: string): string {
  const map: Record<string, string> = {
    valid: '正常',
    expiring_soon: '即将过期',
    expired: '已过期',
    unknown: '未知',
  }
  return map[status] || '未知'
}

async function loadPlatforms() {
  try {
    const { data } = await platformsApi.getSupportedPlatforms()
    supportedPlatforms.value = data || []
  } catch {
    // 静默失败
  }
}

async function loadAccounts() {
  loading.value = true
  try {
    const { data } = await platformsApi.getAuthorizedAccounts({
      platform: filterPlatform.value || undefined,
      skip: (currentPage.value - 1) * pageSize,
      take: pageSize,
    })
    if (data) {
      accounts.value = (data.accounts || []).map((a: AuthorizedAccount) => ({
        ...a,
        _collecting: false,
        _refreshing: false,
      }))
      total.value = data.total || 0
    }
  } catch {
    ElMessage.error('加载账号列表失败')
  } finally {
    loading.value = false
  }
}
async function authorizePlatform(platform: SupportedPlatform) {
  if (isAuthorized(platform.key)) {
    ElMessage.info(`${platform.name} 已授权`)
    return
  }
  try {
    const { data } = await platformsApi.getAuthorizeUrl(platform.key)
    if (data?.url) {
      window.open(data.url, '_blank', 'width=800,height=600')
      addDialogVisible.value = false
      ElMessage.info('请在弹出的窗口中完成授权')
    }
  } catch {
    ElMessage.error('获取授权链接失败')
  }
}

async function collectData(account: AuthorizedAccountWithState) {
  account._collecting = true
  try {
    const { data } = await platformsApi.collectAccountData(account.id, 'daily')
    if (data?.success) {
      ElMessage.success(`${account.nickname} 数据采集成功`)
      loadAccounts()
    } else {
      ElMessage.warning(`采集失败: ${data?.error || '未知错误'}`)
    }
  } catch {
    ElMessage.error('数据采集失败')
  } finally {
    account._collecting = false
  }
}

async function refreshToken(account: AuthorizedAccountWithState) {
  account._refreshing = true
  try {
    const { data } = await platformsApi.refreshToken(account.id)
    if (data?.success) {
      ElMessage.success('Token刷新成功')
      loadAccounts()
    } else {
      ElMessage.warning(data?.message || 'Token刷新失败')
    }
  } catch {
    ElMessage.error('Token刷新失败')
  } finally {
    account._refreshing = false
  }
}

async function refreshAllTokens() {
  if (!hasOAuthAccounts.value) {
    ElMessage.info('当前均为视频号扫码绑定，无需刷新Token')
    return
  }
  refreshing.value = true
  try {
    const { data } = await platformsApi.refreshExpiringTokens()
    const rf = data?.refreshed || 0
    const fa = data?.failed || 0
    if (rf === 0 && fa === 0) {
      ElMessage.info('没有需要刷新的Token')
    } else {
      ElMessage.success(`Token刷新完成: 成功 ${rf}，失败 ${fa}`)
    }
    loadAccounts()
  } catch {
    ElMessage.error('批量刷新Token失败')
  } finally {
    refreshing.value = false
  }
}

async function revokeAuth(account: AuthorizedAccount) {
  try {
    await platformsApi.revokeAuthorization(account.id)
    ElMessage.success('授权已解除')
    loadAccounts()
  } catch {
    ElMessage.error('解除授权失败')
  }
}

// ==================== 初始化 ====================
onMounted(async () => {
  await Promise.all([loadPlatforms(), loadAccounts()])
})
</script>

<style scoped lang="scss">
.platform-manage {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;

  .header-left {
    h2 {
      margin: 0 0 4px 0;
      font-size: 22px;
      font-weight: 600;
      color: #1a1a1a;
    }
    .subtitle {
      font-size: 14px;
      color: #8c8c8c;
    }
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }
}

.platform-stats {
  margin-bottom: 20px;

  .stat-card {
    text-align: center;
    cursor: pointer;
    transition: all 0.3s;
    border: 2px solid transparent;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    &.active {
      border-color: #409eff;
    }

    .stat-icon {
      margin-bottom: 8px;
    }

    .stat-info {
      .stat-name {
        font-size: 14px;
        font-weight: 500;
        color: #303133;
      }
      .stat-count {
        font-size: 12px;
        color: #909399;
        margin-top: 4px;
      }
    }
  }
}

.filter-bar {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.platform-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.account-cell {
  display: flex;
  align-items: center;
  gap: 12px;

  .account-info {
    .nickname {
      font-weight: 500;
      color: #303133;
    }
    .uid {
      font-size: 12px;
      color: #909399;
    }
  }
}

.metric {
  font-weight: 500;
  color: #303133;
}

.time-text {
  font-size: 13px;
  color: #909399;
}

.pagination-wrapper {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.platform-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;

  .platform-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px;
    border: 1px solid #e4e7ed;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s;

    &:hover {
      border-color: #409eff;
      background: #f0f7ff;
    }

    &.authorized {
      border-color: #67c23a;
      background: #f0f9eb;
    }

    .platform-name {
      font-size: 14px;
      font-weight: 500;
      color: #303133;
    }
  }
}
</style>