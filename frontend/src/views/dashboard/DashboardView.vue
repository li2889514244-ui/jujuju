<template>
  <div class="dashboard">
    <!-- Overview Cards -->
    <el-row :gutter="20" class="dashboard__cards">
      <el-col :xs="12" :sm="6" v-for="card in overviewCards" :key="card.title">
        <el-card shadow="hover" class="dashboard__card">
          <div class="dashboard__card-header">
            <span class="dashboard__card-title">{{ card.title }}</span>
            <el-icon :size="24" :style="{ color: card.color }">
              <component :is="card.icon" />
            </el-icon>
          </div>
          <div class="dashboard__card-value">{{ card.value }}</div>
          <div class="dashboard__card-trend" :class="card.trend > 0 ? 'up' : 'down'">
            <el-icon><Top v-if="card.trend > 0" /><Bottom v-else /></el-icon>
            {{ Math.abs(card.trend) }}% 较昨日
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Charts Row -->
    <el-row :gutter="20" class="dashboard__charts">
      <el-col :xs="24" :lg="16">
        <el-card shadow="hover">
          <template #header>
            <div class="dashboard__chart-header">
              <span>粉丝增长趋势</span>
              <el-radio-group v-model="trendDays" size="small">
                <el-radio-button :value="7">近7天</el-radio-button>
                <el-radio-button :value="30">近30天</el-radio-button>
                <el-radio-button :value="90">近90天</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <DataChart :option="followerChartOption" :height="350" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="8">
        <el-card shadow="hover">
          <template #header>平台分布</template>
          <DataChart :option="platformChartOption" :height="350" />
        </el-card>
      </el-col>
    </el-row>

    <!-- Recent Tasks & Notifications -->
    <el-row :gutter="20" class="dashboard__bottom">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <div class="dashboard__chart-header">
              <span>最近发布任务</span>
              <el-button text type="primary" @click="$router.push('/publish')">查看全部</el-button>
            </div>
          </template>
          <el-table :data="recentTasks" stripe style="width: 100%">
            <el-table-column prop="contentTitle" label="内容" show-overflow-tooltip />
            <el-table-column prop="platform" label="平台" width="80">
              <template #default="{ row }">
                <PlatformIcon :platform="row.platform" />
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <StatusBadge :status="row.status" type="publish" />
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="时间" width="160">
              <template #default="{ row }">
                {{ formatTime(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>系统通知</template>
          <div class="dashboard__notifications">
            <div
              v-for="(notice, index) in notifications"
              :key="index"
              class="dashboard__notice-item"
            >
              <el-icon :style="{ color: notice.color }"><component :is="notice.icon" /></el-icon>
              <div class="dashboard__notice-content">
                <p>{{ notice.message }}</p>
                <span>{{ notice.time }}</span>
              </div>
            </div>
            <el-empty v-if="notifications.length === 0" description="暂无通知" />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import DataChart from '@/components/common/DataChart.vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import type { PublishTask } from '@/types'

const trendDays = ref(7)

// TODO: 以下为 mock 数据，正式环境需替换为 API 调用
const overviewCards = ref([
  { title: '账号总数', value: '128', icon: 'UserFilled', color: '#409eff', trend: 5.2 },
  { title: '总粉丝数', value: '2.8M', icon: 'Star', color: '#e6a23c', trend: 3.1 },
  { title: '总点赞数', value: '15.6M', icon: 'DataLine', color: '#67c23a', trend: 8.7 },
  { title: '发布总数', value: '1,024', icon: 'List', color: '#f56c6c', trend: -1.2 },
])

// TODO: 以下为 mock 数据，正式环境需替换为 API 调用
const recentTasks = ref<PublishTask[]>([
  { id: '1', contentId: '1', contentTitle: '探店vlog-朝阳大悦城', accountId: '1', accountNickname: '小明', platform: 'douyin', status: 'success', scheduledAt: null, publishedAt: '2025-05-05T10:00:00', errorMessage: null, createdAt: '2025-05-05T09:30:00' },
  { id: '2', contentId: '2', contentTitle: '美食教程-红烧肉', accountId: '2', accountNickname: '美食家', platform: 'xiaohongshu', status: 'publishing', scheduledAt: '2025-05-05T14:00:00', publishedAt: null, errorMessage: null, createdAt: '2025-05-05T09:00:00' },
  { id: '3', contentId: '3', contentTitle: '旅行日记-三亚', accountId: '3', accountNickname: '旅行者', platform: 'bilibili', status: 'failed', scheduledAt: null, publishedAt: null, errorMessage: 'Cookie已过期', createdAt: '2025-05-04T18:00:00' },
])

// TODO: 以下为 mock 数据，正式环境需替换为 API 调用
const notifications = ref([
  { message: '账号"美食家"Cookie即将过期，请及时更新', icon: 'WarningFilled', color: '#e6a23c', time: '10分钟前' },
  { message: '3个发布任务已完成', icon: 'SuccessFilled', color: '#67c23a', time: '30分钟前' },
  { message: '新成员"张三"加入了团队', icon: 'InfoFilled', color: '#409eff', time: '1小时前' },
])

// TODO: 图表数据为 mock（随机生成），正式环境需从 analyticsApi 获取真实数据
const followerChartOption = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['抖音', '快手', '小红书', 'B站'] },
  grid: { left: 50, right: 20, top: 40, bottom: 30 },
  xAxis: {
    type: 'category' as const,
    data: Array.from({ length: trendDays.value }, (_, i) =>
      dayjs().subtract(trendDays.value - 1 - i, 'day').format('MM-DD')
    ),
  },
  yAxis: { type: 'value' as const, name: '新增粉丝' },
  series: [
    { name: '抖音', type: 'line' as const, smooth: true, data: generateRandomData(trendDays.value, 500, 2000) },
    { name: '快手', type: 'line' as const, smooth: true, data: generateRandomData(trendDays.value, 200, 800) },
    { name: '小红书', type: 'line' as const, smooth: true, data: generateRandomData(trendDays.value, 300, 1500) },
    { name: 'B站', type: 'line' as const, smooth: true, data: generateRandomData(trendDays.value, 100, 600) },
  ],
}))

const platformChartOption = computed(() => ({
  tooltip: { trigger: 'item' as const },
  legend: { bottom: 0 },
  series: [
    {
      type: 'pie' as const,
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold' as const } },
      data: [
        { value: 35, name: '抖音', itemStyle: { color: '#000' } },
        { value: 25, name: '快手', itemStyle: { color: '#ff4906' } },
        { value: 20, name: '小红书', itemStyle: { color: '#ff2442' } },
        { value: 12, name: 'B站', itemStyle: { color: '#fb7299' } },
        { value: 8, name: '视频号', itemStyle: { color: '#07c160' } },
      ],
    },
  ],
}))

function generateRandomData(count: number, min: number, max: number) {
  return Array.from({ length: count }, () => Math.floor(Math.random() * (max - min) + min))
}

function formatTime(time: string) {
  return dayjs(time).format('MM-DD HH:mm')
}

onMounted(() => {
  // Fetch real data in production
})
</script>

<style lang="scss" scoped>
.dashboard {
  &__cards {
    margin-bottom: 20px;
  }

  &__card {
    .el-card__body {
      padding: 20px;
    }

    &-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    &-title {
      font-size: 14px;
      color: #909399;
    }

    &-value {
      font-size: 28px;
      font-weight: 700;
      color: #303133;
      margin-bottom: 8px;
    }

    &-trend {
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;

      &.up {
        color: #67c23a;
      }

      &.down {
        color: #f56c6c;
      }
    }
  }

  &__charts {
    margin-bottom: 20px;
  }

  &__chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__bottom {
    margin-bottom: 20px;
  }

  &__notifications {
    max-height: 320px;
    overflow-y: auto;
  }

  &__notice-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid #f0f0f0;

    &:last-child {
      border-bottom: none;
    }
  }

  &__notice-content {
    flex: 1;

    p {
      font-size: 14px;
      color: #303133;
      margin-bottom: 4px;
    }

    span {
      font-size: 12px;
      color: #c0c4cc;
    }
  }
}
</style>
