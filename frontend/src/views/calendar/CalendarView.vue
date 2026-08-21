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
          <el-button size="small" @click="prevPeriod"
            ><el-icon><ArrowLeft /></el-icon
          ></el-button>
          <span class="cal-period-label">{{ periodLabel }}</span>
          <el-button size="small" @click="nextPeriod"
            ><el-icon><ArrowRight /></el-icon
          ></el-button>
        </el-button-group>
        <el-button size="small" type="primary" @click="openAddDialog">添加日程</el-button>
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
          :class="{ 'cal-day--other': !day.isCurrentMonth, 'cal-day--today': day.isToday }"
        >
          <div class="cal-day__num">{{ day.dayNum }}</div>
          <div class="cal-day__items">
            <div
              v-for="evt in day.events"
              :key="evt.id"
              class="cal-event"
              :style="{ background: evt.color + '22', borderLeftColor: evt.color }"
              @click="openEditDialog(evt)"
            >
              {{ evt.title }}
            </div>
          </div>
        </div>
      </div>
      <div v-if="events.length === 0" class="cal-empty">
        <p>暂无日程安排</p>
        <el-button size="small" type="primary" @click="openAddDialog">
          <el-icon><Plus /></el-icon>添加第一个日程
        </el-button>
      </div>
    </div>

    <!-- Week View -->
    <div v-else class="cal-week">
      <div class="cal-week__header">
        <div
          v-for="d in weekDaysWithDate"
          :key="d.dateKey"
          class="cal-week__col-header"
          :class="{ 'is-today': d.isToday }"
        >
          <div>{{ d.dayName }}</div>
          <div class="cal-week__date">{{ d.dateStr }}</div>
        </div>
      </div>
      <div class="cal-week__body">
        <div
          v-for="d in weekDaysWithDate"
          :key="d.dateKey"
          class="cal-week__col"
          :class="{ 'is-today': d.isToday }"
        >
          <div
            v-for="evt in d.events"
            :key="evt.id"
            class="cal-event cal-event--week"
            :style="{ background: evt.color + '22', borderLeftColor: evt.color }"
            @click="openEditDialog(evt)"
          >
            <span v-if="!evt.allDay" class="cal-event__time">{{
              evt.startTime?.slice(11, 16)
            }}</span>
            <span class="cal-event__title">{{ evt.title }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingEvent ? '编辑日程' : '添加日程'"
      width="480px"
    >
      <el-form :model="form" label-width="80px">
        <el-form-item label="标题">
          <el-input v-model="form.title" placeholder="日程标题" />
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="formDate"
            type="date"
            placeholder="选择日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item v-if="!form.allDay" label="时间">
          <el-time-picker
            v-model="formTime"
            is-range
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 100%"
            format="HH:mm"
          />
        </el-form-item>
        <el-form-item label="全天">
          <el-switch v-model="form.allDay" />
        </el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="form.color" :predefine="predefineColors" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="editingEvent" type="danger" plain @click="deleteEvent">删除</el-button>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEvent">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import dayjs from 'dayjs'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { calendarApi, type CalendarEvent } from '@/api/calendar'

const viewMode = ref<'month' | 'week'>('month')
const currentDate = ref(dayjs())
const events = ref<CalendarEvent[]>([])

onMounted(() => {
  fetchEvents()
})

async function fetchEvents() {
  try {
    const res = await calendarApi.getEvents()
    events.value = res.data || []
  } catch {
    /* 加载失败保持空列表 */
  }
}
const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const dialogVisible = ref(false)
const editingEvent = ref<CalendarEvent | null>(null)
const form = ref({ title: '', allDay: false, color: '#6366f1', description: '' })
const formDate = ref<Date | null>(null)
const formTime = ref<[Date, Date] | null>(null)

const predefineColors = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
  '#a855f7',
  '#64748b',
  '#94a3b8',
]

const periodLabel = computed(() => {
  if (viewMode.value === 'month') return currentDate.value.format('YYYY年 M月')
  return `${currentDate.value.startOf('week').format('M/D')} - ${currentDate.value.endOf('week').format('M/D')}`
})

const monthCells = computed(() => {
  const start = currentDate.value.startOf('month').startOf('week')
  const today = dayjs().format('YYYY-MM-DD')
  return Array.from({ length: 42 }, (_, i) => {
    const d = start.add(i, 'day')
    const dateKey = d.format('YYYY-MM-DD')
    return {
      dayNum: d.date(),
      isCurrentMonth: d.month() === currentDate.value.month(),
      isToday: dateKey === today,
      dateKey,
      events: events.value.filter((e) => dayjs(e.startTime).format('YYYY-MM-DD') === dateKey),
    }
  })
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
      events: events.value.filter((e) => dayjs(e.startTime).format('YYYY-MM-DD') === dateKey),
    }
  })
})

function prevPeriod() {
  currentDate.value = currentDate.value.subtract(1, viewMode.value)
}
function nextPeriod() {
  currentDate.value = currentDate.value.add(1, viewMode.value)
}

function openAddDialog() {
  editingEvent.value = null
  form.value = { title: '', allDay: false, color: '#6366f1', description: '' }
  formDate.value = new Date()
  formTime.value = null
  dialogVisible.value = true
}

function openEditDialog(evt: CalendarEvent) {
  editingEvent.value = evt
  form.value = {
    title: evt.title,
    allDay: evt.allDay,
    color: evt.color,
    description: evt.description,
  }
  formDate.value = new Date(evt.startTime)
  if (!evt.allDay) formTime.value = [new Date(evt.startTime), new Date(evt.endTime)]
  else formTime.value = null
  dialogVisible.value = true
}

async function saveEvent() {
  if (!form.value.title.trim() || !formDate.value) return
  const dateStr = dayjs(formDate.value).format('YYYY-MM-DD')
  const startTime = form.value.allDay
    ? dateStr + 'T00:00:00'
    : dateStr +
      'T' +
      (formTime.value?.[0] ? dayjs(formTime.value[0]).format('HH:mm:ss') : '00:00:00')
  const endTime = form.value.allDay
    ? dateStr + 'T23:59:59'
    : dateStr +
      'T' +
      (formTime.value?.[1] ? dayjs(formTime.value[1]).format('HH:mm:ss') : '23:59:59')

  const payload = {
    title: form.value.title,
    startTime,
    endTime,
    allDay: form.value.allDay,
    color: form.value.color,
    description: form.value.description,
  }

  try {
    if (editingEvent.value) {
      await calendarApi.updateEvent(editingEvent.value.id, payload)
    } else {
      await calendarApi.createEvent(payload)
    }
    dialogVisible.value = false
    await fetchEvents()
  } catch {
    /* 错误由响应拦截器统一处理 */
  }
}

async function deleteEvent() {
  if (!editingEvent.value) return
  try {
    await calendarApi.deleteEvent(editingEvent.value.id)
    dialogVisible.value = false
    await fetchEvents()
  } catch {
    /* 错误由响应拦截器统一处理 */
  }
}
</script>

<style lang="scss" scoped>
.calendar-page {
  display: flex;
  flex-direction: column;
  gap: $space-5;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    h2 {
      margin: 0;
      font-size: $text-h1;
      font-weight: 600;
      letter-spacing: -0.025em;
      color: $text-primary;
    }
  }
  &__controls {
    display: flex;
    align-items: center;
    gap: $space-3;
  }
}

.cal-period-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 160px;
  padding: 6px 14px;
  font-size: $text-body;
  font-weight: 500;
  color: $text-primary;
  background: $bg-elevated;
  border: 1px solid $border-base;
  border-radius: $radius-sm;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.cal-empty {
  text-align: center;
  padding: $space-12 $space-5;
  color: $text-tertiary;
  font-size: $text-body;
  p {
    margin-bottom: $space-4;
  }
}

.cal-month {
  @include card;
  overflow: hidden;
  padding: 0;
}
.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid $border-subtle;
  text-align: center;
  padding: $space-3 0;
  font-size: $text-xs;
  color: $text-tertiary;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: rgba(255, 255, 255, 0.015);
}
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: minmax(96px, auto);
}
.cal-day {
  padding: 6px;
  border-right: 1px solid $border-subtle;
  border-bottom: 1px solid $border-subtle;
  min-height: 100px;
  background: transparent;
  transition: background 0.15s $ease-out;
  &:hover {
    background: rgba(255, 255, 255, 0.015);
  }
  &:nth-child(7n) {
    border-right: none;
  }
  &--other {
    background: rgba(0, 0, 0, 0.15);
    color: $text-placeholder;
    .cal-day__num {
      color: $text-placeholder;
    }
  }
  &--today {
    background: rgba($accent-500, 0.06);
    .cal-day__num {
      color: $accent-400;
      font-weight: 700;
    }
  }
  &__num {
    padding: 2px 6px;
    font-size: $text-body;
    color: $text-secondary;
    font-family: $font-mono;
    font-feature-settings: 'tnum' 1;
    font-variant-numeric: tabular-nums;
  }
  &__items {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 4px;
  }
}

.cal-event {
  padding: 3px 8px;
  border-radius: $radius-sm;
  font-size: $text-xs;
  cursor: pointer;
  border-left: 3px solid;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 500;
  transition:
    transform 0.15s $ease-out,
    filter 0.15s $ease-out;
  &:hover {
    transform: translateX(2px);
    filter: brightness(1.15);
  }
  &__time {
    font-size: $text-micro;
    color: inherit;
    opacity: 0.7;
    margin-right: 4px;
    font-family: $font-mono;
  }
  &--week {
    margin-bottom: 3px;
  }
}

.cal-week {
  @include card;
  padding: 0;
  &__header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-bottom: 1px solid $border-subtle;
  }
  &__col-header {
    text-align: center;
    padding: $space-3 0;
    font-size: $text-xs;
    color: $text-tertiary;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    &.is-today {
      color: $accent-400;
      font-weight: 600;
      background: rgba($accent-500, 0.06);
    }
  }
  &__date {
    font-size: $text-h2;
    font-weight: 600;
    font-family: $font-mono;
    font-feature-settings: 'tnum' 1;
    margin-top: 4px;
  }
  &__body {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    min-height: 480px;
  }
  &__col {
    padding: $space-2;
    border-right: 1px solid $border-subtle;
    display: flex;
    flex-direction: column;
    gap: 3px;
    &:last-child {
      border-right: none;
    }
    &.is-today {
      background: rgba($accent-500, 0.05);
    }
  }
}
</style>
