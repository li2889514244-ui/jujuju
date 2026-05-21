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
            <el-avatar :size="80" :src="account.avatar">{{
              account.nickname?.charAt(0)
            }}</el-avatar>
            <h3>{{ account.nickname }}</h3>
            <div class="account-detail__platform">
              <PlatformIcon :platform="account.platform" show-label />
            </div>
            <StatusBadge :status="account.cookieStatus" type="cookie" />
          </div>

          <el-divider />

          <el-descriptions :column="1" border>
            <el-descriptions-item label="账号ID">{{ account.accountId }}</el-descriptions-item>
            <el-descriptions-item label="分组">{{
              account.groupName || '未分组'
            }}</el-descriptions-item>
            <el-descriptions-item label="粉丝数">{{
              account.followers?.toLocaleString()
            }}</el-descriptions-item>
            <el-descriptions-item label="获赞数">{{
              account.likes?.toLocaleString()
            }}</el-descriptions-item>
            <el-descriptions-item label="最近活跃">{{
              formatTime(account.lastActiveAt)
            }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{
              formatTime(account.createdAt)
            }}</el-descriptions-item>
          </el-descriptions>

          <div class="account-detail__actions">
            <el-button type="danger" @click="handleDelete">删除账号</el-button>
          </div>
        </el-card>
      </el-col>

      <!-- Right: Data + Posts -->
      <el-col :xs="24" :lg="16">
        <!-- Data Overview Cards -->
        <el-row :gutter="12" class="account-detail__analytics" v-if="analytics">
          <el-col :span="8" v-for="card in analyticsCards" :key="card.label">
            <el-card shadow="hover" class="analytics-mini-card">
              <div class="analytics-mini-card__label">{{ card.label }}</div>
              <div class="analytics-mini-card__value">{{ card.value }}</div>
            </el-card>
          </el-col>
        </el-row>

        <!-- Post Performance Table -->
        <el-card shadow="hover">
          <template #header>
            <div class="post-header">
              <span>视频数据明细</span>
              <el-button size="small" @click="exportAccountData">导出数据</el-button>
            </div>
          </template>
          <el-table :data="posts" stripe v-loading="postsLoading" @sort-change="handleSortChange">
            <template #empty><el-empty description="暂无发布内容" /></template>
            <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <StatusBadge :status="row.status" type="publish" size="small" />
              </template>
            </el-table-column>
            <el-table-column prop="publishAt" label="发布时间" width="140" sortable="custom">
              <template #default="{ row }">{{
                formatTime(row.publishAt || row.createdAt)
              }}</template>
            </el-table-column>
            <el-table-column prop="views" label="播放量" width="100" sortable="custom">
              <template #default="{ row }">{{ formatNum(row.views) }}</template>
            </el-table-column>
            <el-table-column prop="likes" label="点赞" width="80" sortable="custom">
              <template #default="{ row }">{{ formatNum(row.likes) }}</template>
            </el-table-column>
            <el-table-column prop="comments" label="评论" width="80" sortable="custom">
              <template #default="{ row }">{{ formatNum(row.comments) }}</template>
            </el-table-column>
            <el-table-column prop="shares" label="分享" width="80" sortable="custom">
              <template #default="{ row }">{{ formatNum(row.shares) }}</template>
            </el-table-column>
            <el-table-column prop="engagementRate" label="互动率" width="80">
              <template #default="{ row }">{{ row.engagementRate }}%</template>
            </el-table-column>
          </el-table>
          <div class="post-pagination" v-if="postTotal > postPageSize">
            <el-pagination
              v-model:current-page="postPage"
              :page-size="postPageSize"
              :total="postTotal"
              layout="total, prev, pager, next"
              @current-change="loadPosts"
            />
          </div>
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
import type { AccountAnalytics } from '@/types'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'

const route = useRoute()
const router = useRouter()
const accountStore = useAccountStore()

const loading = ref(false)
const postsLoading = ref(false)
const posts = ref<any[]>([])
const postPage = ref(1)
const postPageSize = ref(20)
const postTotal = ref(0)
const postSortBy = ref('createdAt')
const postSortOrder = ref<'asc' | 'desc'>('desc')
const analytics = ref<AccountAnalytics | null>(null)

const account = computed(() => accountStore.currentAccount)
const accountId = route.params.id as string

const analyticsCards = computed(() => {
  if (!analytics.value) return []
  const a = analytics.value
  return [
    { label: '总播放量', value: formatNum(a.totalViews) },
    { label: '总点赞', value: formatNum(a.totalLikes) },
    { label: '总评论', value: formatNum(a.totalComments) },
    { label: '总分享', value: formatNum(a.totalShares) },
    { label: '发布内容', value: a.totalPosts.toString() },
    { label: '平均互动率', value: a.avgEngagementRate + '%' },
  ]
})

onMounted(async () => {
  loading.value = true
  try {
    await accountStore.fetchAccountDetail(accountId)
    await Promise.all([loadAnalytics(), loadPosts()])
  } finally {
    loading.value = false
  }
})

async function loadAnalytics() {
  try {
    const res = await accountsApi.getAccountAnalytics(accountId)
    analytics.value = res.data
  } catch {
    analytics.value = null
  }
}

async function loadPosts() {
  postsLoading.value = true
  try {
    const res = await accountsApi.getAccountPosts(accountId, {
      page: postPage.value,
      pageSize: postPageSize.value,
      sortBy: postSortBy.value,
      sortOrder: postSortOrder.value,
    })
    const data = res.data as any
    posts.value = data.items || data.list || []
    postTotal.value = data.total || 0
  } catch {
    posts.value = []
  }
  postsLoading.value = false
}

function handleSortChange({ prop, order }: any) {
  if (!prop) return
  postSortBy.value = prop
  postSortOrder.value = order === 'ascending' ? 'asc' : 'desc'
  postPage.value = 1
  loadPosts()
}

function exportAccountData() {
  const rows = posts.value.map((p: any) => ({
    title: p.title,
    status: p.status,
    publishAt: formatTime(p.publishAt || p.createdAt),
    views: p.views,
    likes: p.likes,
    comments: p.comments,
    shares: p.shares,
    engagementRate: p.engagementRate + '%',
  }))
  const header = '标题,状态,发布时间,播放量,点赞,评论,分享,互动率'
  const csv = [header, ...rows.map((r: any) => Object.values(r).join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${account.value?.nickname || 'account'}_data.csv`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('导出成功')
}

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

function formatNum(n: any): string {
  if (n == null || n === 0) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return Number(n).toLocaleString()
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
    padding: $space-lg 0;
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
  &__analytics {
    margin-bottom: 16px;
  }
}

.analytics-mini-card {
  text-align: center;
  &__label {
    font-size: $text-caption;
    color: #6e6e73;
    margin-bottom: 6px;
  }
  &__value {
    font-size: $text-headline;
    font-weight: 600;
    color: #1D1D1F;
  }
}

.post-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.post-pagination {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}
</style>
