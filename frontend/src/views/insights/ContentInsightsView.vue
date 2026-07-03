<template>
  <div class="content-insights">
    <div class="ci-header">
      <div>
        <h2>内容洞察</h2>
        <p>查看内容排行榜和标签表现</p>
      </div>
      <div class="ci-header__actions">
        <el-select
          v-model="groupId"
          class="ci-filter ci-filter--group"
          clearable
          placeholder="全部老师"
          @change="loadAll"
        >
          <el-option
            v-for="g in groups"
            :key="g.id"
            :value="g.id"
            :label="`${g.name} (${groupAccountCount(g)}账号)`"
          />
        </el-select>
        <el-select
          v-model="platform"
          class="ci-filter"
          clearable
          placeholder="全部平台"
          @change="loadAll"
        >
          <el-option v-for="p in platforms" :key="p.value" :value="p.value" :label="p.label" />
        </el-select>
        <el-button type="primary" :loading="loading" @click="loadAll">刷新</el-button>
      </div>
    </div>

    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      closable
      class="ci-error"
      @close="error = null"
    />

    <el-card shadow="hover" class="ci-section">
      <template #header>
        <div class="ci-section__header">
          <span>排行榜</span>
          <el-radio-group v-model="rankingPeriod" size="small" @change="loadRanking">
            <el-radio-button value="week">周榜</el-radio-button>
            <el-radio-button value="month">月榜</el-radio-button>
            <el-radio-button value="all">总榜</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <div class="ci-ranking-tabs">
        <el-radio-group v-model="rankingTab" size="small" @change="loadRanking">
          <el-radio-button value="views">播放量排行</el-radio-button>
          <el-radio-button value="engagement">互动率排行</el-radio-button>
        </el-radio-group>
      </div>

      <el-table
        v-loading="rankingLoading"
        :data="currentRanking"
        stripe
        size="small"
        max-height="620"
        empty-text="暂无排行数据"
        @row-click="handleRankingClick"
      >
        <el-table-column label="#" width="52" align="center">
          <template #default="{ row }">
            <span class="rank-badge" :class="'rank-' + Math.min(row.rank, 3)">{{ row.rank }}</span>
          </template>
        </el-table-column>
        <el-table-column label="内容" min-width="320">
          <template #default="{ row }">
            <div class="ranking-title">{{ row.title || '无标题' }}</div>
            <div class="ranking-meta">
              <PlatformIcon :platform="row.platform" />
              <span>{{ row.accountName }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="播放量" width="120" align="right" sortable>
          <template #default="{ row }">{{ formatNum(row.views) }}</template>
        </el-table-column>
        <el-table-column label="互动" width="100" align="right" sortable>
          <template #default="{ row }">{{ formatNum(totalEngagement(row)) }}</template>
        </el-table-column>
        <el-table-column label="互动率" width="100" align="right" sortable>
          <template #default="{ row }">{{ Number(row.engagementRate || 0).toFixed(1) }}%</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="hover" class="ci-section">
      <template #header>
        <div class="ci-section__header">
          <span>标签表现</span>
          <span class="ci-section__hint">按内容标签出现次数排序</span>
        </div>
      </template>
      <el-skeleton v-if="tagsLoading" :rows="3" animated />
      <div v-else-if="tags.length > 0" class="ci-tags">
        <span
          v-for="tag in tags"
          :key="tag.name"
          class="ci-tag"
          :class="{ 'ci-tag--active': activeTag === tag.name }"
          :style="{ fontSize: tagSize(tag.count) + 'px' }"
          @click="toggleTag(tag.name)"
        >
          {{ tag.name }}<sup>{{ tag.count }}</sup>
        </span>
      </div>
      <div v-if="activeTag" class="ci-tag-clear">
        <el-button size="small" type="info" plain @click="activeTag = ''; loadRanking()">
          清除标签筛选：{{ activeTag }}
        </el-button>
      </div>
      <el-empty v-else description="暂无标签数据" :image-size="96" />
    </el-card>

    <PostDetailDrawer ref="detailDrawerRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { analyticsApi } from '@/api/analytics'
import { accountsApi } from '@/api/accounts'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import PostDetailDrawer from '@/components/common/PostDetailDrawer.vue'
import { PLATFORM_LABELS, type AccountGroup } from '@/types'
import { toBackend } from '@/utils/platform'

type RankingPeriod = 'week' | 'month' | 'all'
type RankingTab = 'views' | 'engagement'

interface RankingItem {
  rank: number
  postId: string
  title: string
  platform: string
  accountName: string
  accountAvatar: string
  views: number
  likes: number
  comments: number
  shares: number
  engagementRate: number
  publishedAt: string
}

interface TagItem {
  name: string
  count: number
}

const loading = ref(false)
const rankingLoading = ref(false)
const tagsLoading = ref(false)
const error = ref<string | null>(null)
const platform = ref('')
const groupId = ref('')
const groups = ref<AccountGroup[]>([])
const rankingPeriod = ref<RankingPeriod>('all')
const rankingTab = ref<RankingTab>('views')
const viewsRanking = ref<RankingItem[]>([])
const engagementRanking = ref<RankingItem[]>([])
const tags = ref<TagItem[]>([])
const detailDrawerRef = ref()
const activeTag = ref('')

const platforms = Object.entries(PLATFORM_LABELS).map(([value, label]) => ({ value, label }))
const currentRanking = computed(() =>
  rankingTab.value === 'views' ? viewsRanking.value : engagementRanking.value,
)

function filterParams() {
  return {
    platform: platform.value ? toBackend(platform.value) : undefined,
    groupId: groupId.value || undefined,
  }
}

function groupAccountCount(group: AccountGroup): number {
  return group.count ?? (group as AccountGroup & { _count?: { accounts?: number } })._count?.accounts ?? 0
}

async function loadRanking() {
  rankingLoading.value = true
  error.value = null
  try {
    const params = {
      limit: 80,
      period: rankingPeriod.value,
      ...filterParams(),
    }
    if (rankingTab.value === 'views') {
      const res = await analyticsApi.getViewsRanking(params)
      viewsRanking.value = res.data?.ranking || []
    } else {
      const res = await analyticsApi.getEngagementRanking(params)
      engagementRanking.value = res.data?.ranking || []
    }
  } catch (e: any) {
    error.value = e.message || '排行榜加载失败'
  } finally {
    rankingLoading.value = false
  }
}

async function loadTags() {
  tagsLoading.value = true
  try {
    const res = await analyticsApi.getTags({ groupId: groupId.value || undefined })
    tags.value = res.data || []
  } catch (e: any) {
    error.value = e.message || '标签加载失败'
  } finally {
    tagsLoading.value = false
  }
}

async function loadGroups() {
  const res = await accountsApi.getGroups()
  groups.value = res.data || []
}

async function loadAll() {
  loading.value = true
  viewsRanking.value = []
  engagementRanking.value = []
  try {
    await Promise.all([loadRanking(), loadTags(), loadGroups()])
  } finally {
    loading.value = false
  }
}

function formatNum(n: number): string {
  if (!n) return '-'
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

function totalEngagement(row: RankingItem) {
  return (row.likes || 0) + (row.comments || 0) + (row.shares || 0)
}

function tagSize(count: number): number {
  const max = tags.value[0]?.count || 1
  return 14 + (count / max) * 12
}

function handleRankingClick(row: RankingItem) {
  detailDrawerRef.value?.open(row)
}

function toggleTag(tagName: string) {
  if (activeTag.value === tagName) {
    activeTag.value = ''
  } else {
    activeTag.value = tagName
  }
  loadRanking()
}

onMounted(() => {
  loadAll()
})
</script>

<style lang="scss" scoped>
.content-insights {
  padding: 32px;
  max-width: 1440px;
  margin: 0 auto;
  height: 100%;
  overflow-y: auto;
}

.ci-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;

  h2 {
    margin: 0;
    color: var(--color-text-primary);
    font-size: 24px;
    font-weight: 600;
  }

  p {
    margin: 6px 0 0;
    color: var(--color-text-tertiary);
    font-size: 13px;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
}

.ci-filter {
  width: 120px;

  &--group {
    width: 170px;
  }
}

.ci-error,
.ci-section {
  margin-bottom: 24px;
}

.ci-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.ci-section__hint {
  color: #667085;
  font-size: 12px;
}

.ci-ranking-tabs {
  margin-bottom: 12px;
}

.rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: #eef2f7;
  color: #344054;
  font-size: 12px;
  font-weight: 600;

  &.rank-1 {
    background: #f59e0b20;
    color: #f59e0b;
  }

  &.rank-2 {
    background: #94a3b820;
    color: #94a3b8;
  }

  &.rank-3 {
    background: #d9770620;
    color: #d97706;
  }
}

.ranking-title {
  max-width: 640px;
  overflow: hidden;
  color: #1f2937;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  color: #475467;
  font-size: 12px;
}

.ci-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 14px;
  padding: 16px 0 8px;
}

.ci-tag {
  color: #364fc7;
  cursor: pointer;
  font-weight: 600;
  line-height: 1.2;
  transition: color 0.15s;

  &:hover {
    color: #1e1b4b;
  }

  &--active {
    color: #fff;
    background: #364fc7;
    padding: 2px 8px;
    border-radius: 6px;
  }

  sup {
    margin-left: 2px;
    color: #667085;
    font-size: 0.64em;
    font-weight: 500;
  }
}

.ci-tag-clear {
  margin-top: 8px;
}

:deep(.ci-section .el-card__header) {
  color: #111827;
}

:deep(.ci-section .el-table) {
  --el-table-text-color: #344054;
  --el-table-header-text-color: #667085;
  --el-table-row-hover-bg-color: #f1f5ff;
  color: #344054;
}

:deep(.ci-section .el-table th.el-table__cell) {
  color: #667085;
}

:deep(.ci-section .el-table td.el-table__cell) {
  color: #344054;
}

:deep(.ci-section .el-table__stripe .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: #f8fafc;
}

@media (max-width: 900px) {
  .content-insights {
    padding: 20px;
  }

  .ci-header {
    flex-direction: column;

    &__actions {
      width: 100%;
      flex-wrap: wrap;
    }
  }
}
</style>
