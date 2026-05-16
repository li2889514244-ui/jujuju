<template>
  <div class="calendar-page">
    <div class="calendar-page__header">
      <h2>内容日历</h2>
      <div class="calendar-page__controls">
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="month">月</el-radio-button>
          <el-radio-button value="week">周</el-radio-button>
        </el-radio-group>
        <el-button-group>
          <el-button size="small" @click="prevPeriod"><el-icon><ArrowLeft /></el-icon></el-button>
          <el-button size="small" disabled>{{ periodLabel }}</el-button>
          <el-button size="small" @click="nextPeriod"><el-icon><ArrowRight /></el-icon></el-button>
        </el-button-group>
        <el-button size="small" type="primary" @click="$router.push('/content')">新建内容</el-button>
      </div>
    </div>

    <!-- Month View -->
    <div v-if="viewMode === 'month'" class="cal-month">
      <div class="cal-weekdays">
        <div v-for="d in weekDays" :key="d" class="cal-weekday">{{ d }}</div>
      </div>
      <div class="cal-grid">
        <div
          v-for="(day, i) in monthCells"
          :key="i"
          class="cal-day"
          :class="{
            'cal-day--other': !day.isCurrentMonth,
            'cal-day--today': day.isToday,
          }"
        >
          <div class="cal-day__num">{{ day.dayNum }}</div>
          <div class="cal-day__items">
            <div
              v-for="task in day.tasks"
              :key="task.id"
              class="cal-task"
              :class="'cal-task--' + task.status"
              @click="openTask(task)"
            >
              <span class="cal-task__platform">
                <PlatformIcon :platform="task.platform" :size="14" />
              </span>
              <span class="cal-task__title">{{ task.title || '无标题' }}</span>
              <span class="cal-task__time" v-if="task.publishAt">{{ formatTimeShort(task.publishAt) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Week View -->
    <div v-else class="cal-week">
      <div class="cal-week__header">
        <div v-for="d in weekDaysWithDate" :key="d.dateKey" class="cal-week__col-header" :class="{ 'is-today': d.isToday }">
          <div>{{ d.dayName }}</div>
          <div class="cal-week__date">{{ d.dateStr }}</div>
        </div>
      </div>
      <div class="cal-week__body">
        <div v-for="d in weekDaysWithDate" :key="d.dateKey" class="cal-week__col" :class="{ 'is-today': d.isToday }">
          <div
            v-for="task in d.tasks"
            :key="task.id"
            class="cal-task cal-task--week"
            :class="'cal-task--' + task.status"
            @click="openTask(task)"
          >
            <span class="cal-task__platform"><PlatformIcon :platform="task.platform" :size="14" /></span>
            <span class="cal-task__title">{{ task.title || '无标题' }}</span>
            <span class="cal-task__time" v-if="task.publishAt">{{ task.publishAt.slice(11, 16) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="cal-legend">
      <span class="cal-legend__item"><span class="cal-dot cal-dot--DRAFT"></span> 草稿</span>
      <span class="cal-legend__item"><span class="cal-dot cal-dot--SCHEDULED"></span> 已排期</span>
      <span class="cal-legend__item"><span class="cal-dot cal-dot--PUBLISHED"></span> 已发布</span>
      <span class="cal-legend__item"><span class="cal-dot cal-dot--FAILED"></span> 失败</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import PlatformIcon from '@/components/common/PlatformIcon.vue'
import { contentApi } from '@/api/content'

const viewMode = ref<'month' | 'week'>('month')
const currentDate = ref(dayjs())
const scheduledTasks = ref<any[]>([])
const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const periodLabel = computed(() => {
  if (viewMode.value === 'month') return currentDate.value.format('YYYY年 M月')
  const start = currentDate.value.startOf('week')
  const end = currentDate.value.endOf('week')
  return `${start.format('M/D')} - ${end.format('M/D')}`
})

const monthCells = computed(() => {
  const start = currentDate.value.startOf('month').startOf('week')
  const today = dayjs().format('YYYY-MM-DD')
  const cells = []
  for (let i = 0; i < 42; i++) {
    const d = start.add(i, 'day')
    const dateKey = d.format('YYYY-MM-DD')
    cells.push({
      dayNum: d.date(),
      isCurrentMonth: d.month() === currentDate.value.month(),
      isToday: dateKey === today,
      dateKey,
      tasks: scheduledTasks.value.filter((t: any) => {
        const taskDate = dayjs(t.publishAt || t.scheduledAt).format('YYYY-MM-DD')
        return taskDate === dateKey
      }),
    })
  }
  return cells
})

const weekDaysWithDate = computed(() => {
  const start = currentDate.value.startOf('week')
  const today = dayjs().format('YYYY-MM-DD')
  return Array.from({ length: 7 }, (_, i) => {
    const d = start.add(i, 'day')
    const dateKey = d.format('YYYY-MM-DD')
    return {
      dayName: weekDays[i],
      dateStr: d.format('M/D'),
      isToday: dateKey === today,
      dateKey,
      tasks: scheduledTasks.value.filter((t: any) => {
        const taskDate = dayjs(t.publishAt || t.scheduledAt).format('YYYY-MM-DD')
        return taskDate === dateKey
      }),
    }
  })
})

function prevPeriod() {
  currentDate.value = currentDate.value.subtract(1, viewMode.value)
}
function nextPeriod() {
  currentDate.value = currentDate.value.add(1, viewMode.value)
}
function formatTimeShort(t: string) {
  return dayjs(t).format('HH:mm')
}
function openTask(task: any) {
  window.open(`/content/${task.id || task.contentId}`, '_self')
}

async function loadTasks() {
  try {
    const res = await contentApi.getList({ limit: 200 }) as any
    const posts = res.data?.posts || res.data?.list || []
    scheduledTasks.value = posts.filter((p: any) => p.publishAt || p.status === 'SCHEDULED' || p.status === 'PUBLISHED')
      .map((p: any) => ({
        id: p.id,
        title: p.title || '无标题',
        platform: (p.account?.platform || '').toLowerCase(),
        status: (p.status || 'DRAFT').toLowerCase(),
        publishAt: p.publishAt || p.scheduledAt,
      }))
  } catch { /* silent */ }
}

onMounted(() => loadTasks())
</script>

<style lang="scss" scoped>
.calendar-page {
  &__header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 20px;
    h2 { margin: 0; font-size: 20px; }
  }
  &__controls { display: flex; align-items: center; gap: 12px; }
}

.cal-month {
  background: #fff; border-radius: 8px; overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
}
.cal-weekdays {
  display: grid; grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid #ebeef5; text-align: center;
  padding: 10px 0; font-size: 13px; color: #909399; font-weight: 500;
  background: #fafafa;
}
.cal-grid {
  display: grid; grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: minmax(100px, auto);
}
.cal-day {
  padding: 4px; border-right: 1px solid #f0f0f0; border-bottom: 1px solid #f0f0f0;
  min-height: 100px; cursor: default;
  &:nth-child(7n) { border-right: none; }
  &--other { background: #fafafa; color: #c0c4cc; }
  &--today { background: #ecf5ff;
    .cal-day__num { color: #409eff; font-weight: 700; }
  }
  &__num { padding: 2px 6px; font-size: 13px; color: #606266; }
  &__items { display: flex; flex-direction: column; gap: 2px; margin-top: 2px; }
}
.cal-task {
  display: flex; align-items: center; gap: 3px;
  padding: 1px 4px; border-radius: 3px; font-size: 11px;
  cursor: pointer; overflow: hidden;
  &__platform { flex-shrink: 0; }
  &__title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
  &__time { color: #909399; flex-shrink: 0; }
  &--draft { background: #f5f5f5; }
  &--scheduled { background: #fdf6ec; }
  &--published { background: #f0f9eb; }
  &--failed { background: #fef0f0; }
  &--week { margin-bottom: 2px; }
}

.cal-week {
  background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.06);
  &__header { display: grid; grid-template-columns: repeat(7, 1fr); border-bottom: 1px solid #ebeef5; }
  &__col-header {
    text-align: center; padding: 8px 0; font-size: 13px; color: #606266;
    &.is-today { color: #409eff; font-weight: 600; }
  }
  &__date { font-size: 20px; font-weight: 500; }
  &__body { display: grid; grid-template-columns: repeat(7, 1fr); }
  &__col { padding: 6px 4px; min-height: 200px; border-right: 1px solid #f0f0f0;
    &:last-child { border-right: none; }
    &.is-today { background: #ecf5ff; }
  }
}

.cal-legend {
  display: flex; gap: 20px; margin-top: 16px; padding: 0 8px;
  &__item { font-size: 12px; color: #909399; display: flex; align-items: center; gap: 4px; }
}
.cal-dot {
  width: 10px; height: 10px; border-radius: 50%; display: inline-block;
  &--DRAFT { background: #c0c4cc; }
  &--SCHEDULED { background: #e6a23c; }
  &--PUBLISHED { background: #67c23a; }
  &--FAILED { background: #f56c6c; }
}
</style>
