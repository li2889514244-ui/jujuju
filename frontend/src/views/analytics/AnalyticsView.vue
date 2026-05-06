<template>
  <div class="analytics">
    <!-- Filters -->
    <el-card shadow="hover" class="analytics__filter">
      <el-form :inline="true">
        <el-form-item label="时间范围">
          <el-select v-model="days" style="width: 140px">
            <el-option label="近7天" :value="7" />
            <el-option label="近30天" :value="30" />
            <el-option label="近90天" :value="90" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台">
          <el-select v-model="platform" placeholder="全部平台" clearable style="width: 140px">
            <el-option label="全部" value="" />
            <el-option v-for="(label, key) in PLATFORM_LABELS" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="refreshData">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Charts -->
    <el-row :gutter="20" class="analytics__charts">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>粉丝增长趋势</template>
          <DataChart :option="followerChart" :height="350" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>互动率趋势</template>
          <DataChart :option="engagementChart" :height="350" />
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="analytics__charts">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>发布效果</template>
          <DataChart :option="publishEffectChart" :height="350" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>平台对比</template>
          <DataChart :option="platformCompareChart" :height="350" />
        </el-card>
      </el-col>
    </el-row>

    <!-- Platform Stats Table -->
    <el-card shadow="hover">
      <template #header>平台数据明细</template>
      <el-table :data="platformStats" stripe>
        <el-table-column label="平台" width="100">
          <template #default="{ row }">
            <PlatformIcon :platform="row.platform" show-label />
          </template>
        </el-table-column>
        <el-table-column prop="accounts" label="账号数" width="100" />
        <el-table-column prop="followers" label="粉丝数" width="120">
          <template #default="{ row }">{{ row.followers?.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="likes" label="获赞数" width="120">
          <template #default="{ row }">{{ row.likes?.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="publishes" label="发布数" width="100" />
        <el-table-column prop="engagementRate" label="互动率" width="100">
          <template #default="{ row }">{{ row.engagementRate }}%</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { analyticsApi } from '@/api/analytics'
import { PLATFORM_LABELS, type PlatformStats as PlatformStatsType } from '@/types'
import DataChart from '@/components/common/DataChart.vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'

const days = ref(30)
const platform = ref('')
const platformStats = ref<PlatformStatsType[]>([])

const dateLabels = computed(() =>
  Array.from({ length: days.value }, (_, i) =>
    dayjs().subtract(days.value - 1 - i, 'day').format('MM-DD')
  )
)

// TODO: 图表数据为 mock（随机生成），正式环境需从 analyticsApi 获取真实数据
const followerChart = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['新增粉丝'] },
  grid: { left: 50, right: 20, top: 40, bottom: 30 },
  xAxis: { type: 'category' as const, data: dateLabels.value },
  yAxis: { type: 'value' as const, name: '新增粉丝' },
  series: [
    {
      name: '新增粉丝',
      type: 'line' as const,
      smooth: true,
      areaStyle: { opacity: 0.3 },
      data: Array.from({ length: days.value }, () => Math.floor(Math.random() * 1500 + 500)),
    },
  ],
}))

const engagementChart = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['点赞率', '评论率', '分享率'] },
  grid: { left: 50, right: 20, top: 40, bottom: 30 },
  xAxis: { type: 'category' as const, data: dateLabels.value },
  yAxis: { type: 'value' as const, name: '百分比(%)' },
  series: [
    { name: '点赞率', type: 'line' as const, smooth: true, data: Array.from({ length: days.value }, () => +(Math.random() * 5 + 2).toFixed(1)) },
    { name: '评论率', type: 'line' as const, smooth: true, data: Array.from({ length: days.value }, () => +(Math.random() * 2 + 0.5).toFixed(1)) },
    { name: '分享率', type: 'line' as const, smooth: true, data: Array.from({ length: days.value }, () => +(Math.random() * 1 + 0.2).toFixed(1)) },
  ],
}))

const publishEffectChart = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['播放量', '点赞', '评论', '分享'] },
  grid: { left: 60, right: 20, top: 40, bottom: 30 },
  xAxis: { type: 'category' as const, data: dateLabels.value },
  yAxis: { type: 'value' as const },
  series: [
    { name: '播放量', type: 'bar' as const, data: Array.from({ length: days.value }, () => Math.floor(Math.random() * 50000 + 10000)) },
    { name: '点赞', type: 'bar' as const, data: Array.from({ length: days.value }, () => Math.floor(Math.random() * 5000 + 1000)) },
    { name: '评论', type: 'bar' as const, data: Array.from({ length: days.value }, () => Math.floor(Math.random() * 500 + 100)) },
    { name: '分享', type: 'bar' as const, data: Array.from({ length: days.value }, () => Math.floor(Math.random() * 200 + 50)) },
  ],
}))

const platformCompareChart = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { bottom: 0 },
  radar: {
    indicator: [
      { name: '粉丝', max: 1000000 },
      { name: '点赞', max: 5000000 },
      { name: '发布', max: 500 },
      { name: '互动率', max: 10 },
      { name: '增长', max: 20 },
    ],
  },
  series: [
    {
      type: 'radar' as const,
      data: [
        { value: [800000, 3000000, 300, 6.5, 12], name: '抖音' },
        { value: [400000, 1500000, 200, 4.2, 8], name: '快手' },
        { value: [300000, 800000, 150, 5.8, 15], name: '小红书' },
      ],
    },
  ],
}))

function refreshData() {
  loadStats()
}

async function loadStats() {
  const res = await analyticsApi.getPlatformStats()
  platformStats.value = res.data
}

onMounted(() => {
  loadStats()
})
</script>

<style lang="scss" scoped>
.analytics {
  &__filter {
    margin-bottom: 20px;
  }

  &__charts {
    margin-bottom: 20px;
  }
}
</style>
