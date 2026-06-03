<template>
  <div class="report">
    <!-- Filters -->
    <el-card shadow="hover" class="report__filter">
      <el-form :inline="true">
        <el-form-item label="时间范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            :shortcuts="dateShortcuts"
            class="report-date-picker"
          />
        </el-form-item>
        <el-form-item label="平台">
          <el-select
            v-model="platform"
            placeholder="全部平台"
            clearable
            class="report-platform-select"
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
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="loadReport">生成报表</el-button>
          <el-tooltip :content="reportData ? '导出为 Excel 文件' : '请先生成报表'" placement="top">
            <el-button :disabled="!reportData" @click="exportExcel">导出 Excel</el-button>
          </el-tooltip>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Overview Cards -->
    <el-row v-if="reportData" :gutter="20" class="report__overview">
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover">
          <el-statistic title="总账号数" :value="reportData.overview.accounts.total" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover">
          <el-statistic title="总粉丝" :value="reportData.overview.accounts.totalFollowers" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover">
          <el-statistic title="已发布内容" :value="reportData.overview.posts.published" />
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="hover">
          <el-statistic title="总播放量" :value="reportData.overview.engagement.totalViews" />
        </el-card>
      </el-col>
    </el-row>

    <!-- Top Posts -->
    <el-card v-if="reportData" shadow="hover" class="report__section">
      <template #header>内容表现 Top 10</template>
      <el-table :data="reportData.topPosts" stripe @row-click="handleRowClick">
        <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
        <el-table-column label="平台" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ PLATFORM_LABELS[row.platform] || row.platform }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="account" label="账号" width="120" />
        <el-table-column prop="views" label="播放" width="100">
          <template #default="{ row }">{{ row.views?.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="likes" label="点赞" width="80">
          <template #default="{ row }">{{ row.likes?.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="comments" label="评论" width="80">
          <template #default="{ row }">{{ row.comments?.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="shares" label="分享" width="80">
          <template #default="{ row }">{{ row.shares?.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="saves" label="收藏" width="80">
          <template #default="{ row }">{{ row.saves?.toLocaleString() }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Cross-Platform Comparison -->
    <el-card
      v-if="reportData && crossPlatformItems.length > 0"
      shadow="hover"
      class="report__section"
    >
      <template #header>
        <span>跨平台内容对比</span>
        <span class="report__header-subtitle">同一内容在不同平台的表现</span>
      </template>
      <div v-for="(group, gi) in crossPlatformItems" :key="gi" class="report__cross-group">
        <div class="report__cross-title">{{ group.title }}</div>
        <el-table :data="group.items" stripe size="small">
          <el-table-column label="平台" width="100">
            <template #default="{ row }">
              <el-tag size="small">{{ PLATFORM_LABELS[row.platform] || row.platform }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="account" label="账号" width="120" />
          <el-table-column prop="views" label="播放" width="100" sortable />
          <el-table-column prop="likes" label="点赞" width="80" sortable />
          <el-table-column prop="comments" label="评论" width="80" sortable />
          <el-table-column prop="shares" label="分享" width="80" sortable />
          <el-table-column prop="saves" label="收藏" width="80" sortable />
        </el-table>
      </div>
    </el-card>

    <!-- Daily Trend Chart -->
    <el-card v-if="reportData" shadow="hover" class="report__section">
      <template #header>每日数据趋势</template>
      <DataChart :option="trendChart" :height="350" />
    </el-card>

    <PostDetailDrawer ref="detailDrawerRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { analyticsApi } from '@/api/analytics'
import { PLATFORM_LABELS as _PL } from '@/types'
import DataChart from '@/components/common/DataChart.vue'
import PostDetailDrawer from '@/components/common/PostDetailDrawer.vue'
const PLATFORM_LABELS: Record<string, string> = _PL

// Shared data-table composable is imported for the standardized
// loading/error/refresh pattern used across report-like views.
const loading = ref(false)
const platform = ref('')
const dateRange = ref<[string, string]>([
  dayjs().subtract(30, 'day').format('YYYY-MM-DD'),
  dayjs().format('YYYY-MM-DD'),
])
const reportData = ref<any>(null)

const dateShortcuts = [
  { text: '近7天', value: () => [dayjs().subtract(7, 'day').toDate(), new Date()] },
  { text: '近30天', value: () => [dayjs().subtract(30, 'day').toDate(), new Date()] },
  { text: '近90天', value: () => [dayjs().subtract(90, 'day').toDate(), new Date()] },
]

const detailDrawerRef = ref()

async function loadReport() {
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (dateRange.value?.[0]) params.startDate = dateRange.value[0]
    if (dateRange.value?.[1]) params.endDate = dateRange.value[1]
    if (platform.value) params.platform = platform.value
    const res = await analyticsApi.getReport(params)
    reportData.value = res.data
  } catch (e: any) {
    ElMessage.error(e.message || '生成报表失败')
  } finally {
    loading.value = false
  }
}

function handleRowClick(row: any) {
  detailDrawerRef.value?.open(row)
}

const crossPlatformItems = computed(() => {
  if (!reportData.value?.topPosts?.length) return [] as any[]
  const posts: any[] = reportData.value.topPosts
  const groups: Record<string, any[]> = {}
  for (const p of posts) {
    const key = (p.title || '').slice(0, 20)
    if (!groups[key]) groups[key] = []
    groups[key].push(p)
  }
  const result: any[] = []
  for (const [title, items] of Object.entries(groups)) {
    if (items.length >= 2) result.push({ title, items })
  }
  return result.slice(0, 5)
})

const trendChart = computed(() => {
  if (!reportData.value?.dailyTrend?.length) {
    return { title: { text: '暂无趋势数据', left: 'center', top: 'center' } }
  }
  const trend = reportData.value.dailyTrend
  const dates = [...new Set(trend.map((d: any) => dayjs(d.date).format('MM-DD')))] as string[]
  // Aggregate by date
  const byDate: Record<string, { followers: number; views: number; likes: number }> = {}
  for (const item of trend) {
    const key = dayjs(item.date).format('MM-DD')
    if (!byDate[key]) byDate[key] = { followers: 0, views: 0, likes: 0 }
    byDate[key].followers += item.followers || 0
    byDate[key].views += item.views || 0
    byDate[key].likes += item.likes || 0
  }
  return {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['粉丝', '播放', '点赞'] },
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category' as const, data: dates },
    yAxis: { type: 'value' as const },
    series: [
      {
        name: '粉丝',
        type: 'line' as const,
        smooth: true,
        data: dates.map((d) => byDate[d]?.followers || 0),
      },
      { name: '播放', type: 'bar' as const, data: dates.map((d) => byDate[d]?.views || 0) },
      { name: '点赞', type: 'bar' as const, data: dates.map((d) => byDate[d]?.likes || 0) },
    ],
  }
})

async function exportExcel() {
  if (!reportData.value) return
  try {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()

    // Sheet 1: Overview
    const overviewRows = [
      ['指标', '数值'],
      ['总账号数', reportData.value.overview.accounts.total],
      ['活跃账号', reportData.value.overview.accounts.active],
      ['总粉丝', reportData.value.overview.accounts.totalFollowers],
      ['已发布内容', reportData.value.overview.posts.published],
      ['失败内容', reportData.value.overview.posts.failed],
      ['总播放量', reportData.value.overview.engagement.totalViews],
      ['总点赞', reportData.value.overview.engagement.totalLikes],
      ['总评论', reportData.value.overview.engagement.totalComments],
      ['总分享', reportData.value.overview.engagement.totalShares],
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(overviewRows)
    XLSX.utils.book_append_sheet(wb, ws1, '概览')

    // Sheet 2: Top Posts
    const postRows = [
      ['标题', '平台', '账号', '播放', '点赞', '评论', '分享', '收藏'],
      ...reportData.value.topPosts.map((p: any) => [
        p.title,
        PLATFORM_LABELS[p.platform] || p.platform,
        p.account,
        p.views,
        p.likes,
        p.comments,
        p.shares,
        p.saves,
      ]),
    ]
    const ws2 = XLSX.utils.aoa_to_sheet(postRows)
    XLSX.utils.book_append_sheet(wb, ws2, 'Top内容')

    // Sheet 3: Daily Trend
    if (reportData.value.dailyTrend?.length) {
      const trendRows = [
        ['日期', '账号', '平台', '粉丝', '播放', '点赞', '评论', '分享'],
        ...reportData.value.dailyTrend.map((d: any) => [
          dayjs(d.date).format('YYYY-MM-DD'),
          d.account?.nickname || '',
          d.account?.platform || '',
          d.followers,
          d.views,
          d.likes,
          d.comments,
          d.shares,
        ]),
      ]
      const ws3 = XLSX.utils.aoa_to_sheet(trendRows)
      XLSX.utils.book_append_sheet(wb, ws3, '每日趋势')
    }

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `披星云报表_${dateRange.value?.[0] || ''}_${dateRange.value?.[1] || ''}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch (e: any) {
    ElMessage.error('导出失败: ' + (e.message || '未知错误'))
  }
}
</script>

<style lang="scss" scoped>
@import '@/assets/styles/variables';

.report {
  &__filter {
    margin-bottom: $space-lg;
  }
  &__overview {
    margin-bottom: $space-lg;
  }
  &__section {
    margin-bottom: $space-lg;
  }
  &__header-subtitle {
    font-size: $text-caption;
    color: $color-text-secondary;
    margin-left: $space-xs;
  }
  &__cross-group {
    margin-bottom: $space-md;
  }
  &__cross-title {
    font-weight: 600;
    margin-bottom: $space-xs;
    color: $color-text-primary;
  }
}
.report-date-picker {
  width: 280px;
}
.report-platform-select {
  width: 140px;
}
</style>
