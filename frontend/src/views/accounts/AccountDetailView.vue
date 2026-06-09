<template>
  <div v-loading="loading" class="account-detail">
    <!-- Back -->
    <el-page-header title="返回账号列表" @back="$router.push('/accounts')">
      <template #content>
        <span class="account-detail__title">{{ account?.nickname }}</span>
      </template>
    </el-page-header>

    <el-row v-if="account" :gutter="20" class="account-detail__content">
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
            <el-descriptions-item label="关注数">{{
              account.following?.toLocaleString()
            }}</el-descriptions-item>
            <el-descriptions-item label="简介">{{
              account.bio || '暂无简介'
            }}</el-descriptions-item>
            <el-descriptions-item label="获赞数">{{
              account.likes?.toLocaleString()
            }}</el-descriptions-item>
            <el-descriptions-item v-if="account.storeScore != null" label="店铺评分">
              {{ account.storeScore }}
            </el-descriptions-item>
            <el-descriptions-item v-if="account.storeDiagnosis" label="店铺诊断">
              {{ account.storeDiagnosis }}
            </el-descriptions-item>
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
        <el-row v-if="analytics" :gutter="12" class="account-detail__analytics">
          <el-col v-for="card in analyticsCards" :key="card.label" :span="8">
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
          <el-table
            v-loading="postsLoading"
            :data="posts"
            stripe
            @sort-change="handleSortChange"
            @row-click="handleRowClick"
          >
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
            <el-table-column prop="saves" label="收藏" width="80" sortable="custom">
              <template #default="{ row }">{{ formatNum(row.saves) }}</template>
            </el-table-column>
            <el-table-column prop="engagementRate" label="互动率" width="80">
              <template #default="{ row }">{{ row.engagementRate }}%</template>
            </el-table-column>
          </el-table>
          <div v-if="postTotal > postPageSize" class="post-pagination">
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

    <PostDetailDrawer ref="detailDrawerRef" />
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
import PostDetailDrawer from '@/components/common/PostDetailDrawer.vue'

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
    { label: '总收藏', value: formatNum(a.totalSaves) },
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

const detailDrawerRef = ref()

function handleSortChange({ prop, order }: any) {
  if (!prop) return
  postSortBy.value = prop
  postSortOrder.value = order === 'ascending' ? 'asc' : 'desc'
  postPage.value = 1
  loadPosts()
}

function handleRowClick(row: any) {
  detailDrawerRef.value?.open(row)
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
    saves: p.saves,
    engagementRate: p.engagementRate + '%',
  }))
  const header = '标题,状态,发布时间,播放量,点赞,评论,分享,收藏,互动率'
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
  display: flex;
  flex-direction: column;
  gap: $space-5;

  &__title {
    font-size: $text-h3;
    font-weight: 600;
    color: $text-primary;
    margin-left: $space-3;
  }
  &__content {
    margin-top: 0;
  }
  &__profile {
    text-align: center;
    padding: $space-6 0 $space-4;
    h3 {
      margin: $space-3 0 $space-2;
      font-size: $text-h3;
      font-weight: 600;
      color: $text-primary;
      letter-spacing: -0.01em;
    }
  }
  &__platform {
    margin: $space-2 0;
    display: flex;
    justify-content: center;
  }
  &__actions {
    margin-top: $space-5;
    display: flex;
    flex-direction: column;
    gap: $space-2;
    .el-button {
      width: 100%;
    }
  }
  &__analytics {
    margin-bottom: $space-4;
  }
}

.analytics-mini-card {
  text-align: center;
  background: $bg-elevated;
  border: 1px solid $border-base;
  border-radius: $radius-lg;
  transition:
    border-color 0.2s $ease-out,
    transform 0.2s $ease-out;

  &:hover {
    border-color: $border-strong;
    transform: translateY(-1px);
  }

  :deep(.el-card__body) {
    padding: $space-4 $space-3;
  }

  &__label {
    font-size: $text-xs;
    color: $text-tertiary;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 500;
    margin-bottom: $space-2;
  }
  &__value {
    font-size: $text-h2;
    font-weight: 600;
    color: $text-primary;
    font-family: $font-mono;
    font-feature-settings: 'tnum' 1;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
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
  margin-top: $space-4;
}
</style>
