<template>
  <div class="calendar-page">
    <div class="calendar-page__header">
      <h2>日程管理</h2>
      <div class="calendar-page__controls">
        <el-radio-group v-model="viewMode" size="small">
          <el-radio-button value="month">月</el-radio-button>
          <el-radio-button value="week">周</el-radio-button>
        </el-radio-group>
        <el-button-group>
          <el-button size="small" @click="prevPeriod"
            ><el-icon><ArrowLeft /></el-icon
          ></el-button>
          <el-button size="small" disabled>{{ periodLabel }}</el-button>
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
            <span class="cal-event__time" v-if="!evt.allDay">{{
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
        <el-form-item label="时间" v-if="!form.allDay">
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
        <el-button v-if="editingEvent" type="danger" @click="deleteEvent" plain>删除</el-button>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEvent">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import dayjs from 'dayjs'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'

interface CalEvent {
  id: string
  title: string
  startTime: string
  endTime: string
  allDay: boolean
  color: string
  description: string
}

const STORAGE_KEY = 'matrixflow_calendar_events'

function loadEvents(): CalEvent[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}
function saveEvents(events: CalEvent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
}

const viewMode = ref<'month' | 'week'>('month')
const currentDate = ref(dayjs())
const events = ref<CalEvent[]>(loadEvents())
const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const dialogVisible = ref(false)
const editingEvent = ref<CalEvent | null>(null)
const form = ref({ title: '', allDay: false, color: '#0a84ff', description: '' })
const formDate = ref<Date | null>(null)
const formTime = ref<[Date, Date] | null>(null)

const predefineColors = [
  '#0a84ff',
  '#30d158',
  '#ff9f0a',
  '#ff453a',
  '#6e6e73',
  '#8b5cf6',
  '#06b6d4',
  '#f59e0b',
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
  form.value = { title: '', allDay: false, color: '#0a84ff', description: '' }
  formDate.value = new Date()
  formTime.value = null
  dialogVisible.value = true
}

function openEditDialog(evt: CalEvent) {
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

function saveEvent() {
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

  if (editingEvent.value) {
    const idx = events.value.findIndex((e) => e.id === editingEvent.value!.id)
    if (idx >= 0) events.value[idx] = { ...editingEvent.value, ...form.value, startTime, endTime }
  } else {
    events.value.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ...form.value,
      startTime,
      endTime,
    })
  }
  saveEvents(events.value)
  dialogVisible.value = false
}

function deleteEvent() {
  if (!editingEvent.value) return
  events.value = events.value.filter((e) => e.id !== editingEvent.value!.id)
  saveEvents(events.value)
  dialogVisible.value = false
}
</script>

<style lang="scss" scoped>
.calendar-page {
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    h2 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
  }
  &__controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}

.cal-month {
  @include glass;
  border: 1px solid var(--el-border-color);
  border-radius: $radius-lg;
  overflow: hidden;
}
.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--el-border-color);
  text-align: center;
  padding: 10px 0;
  font-size: 13px;
  color: var(--el-text-color-placeholder);
  font-weight: 500;
  background: transparent;
}
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: minmax(100px, auto);
}
.cal-day {
  padding: 4px;
  border-right: 1px solid var(--el-border-color-light);
  border-bottom: 1px solid var(--el-border-color-light);
  min-height: 100px;
  &:nth-child(7n) {
    border-right: none;
  }
  &--other {
    background: var(--el-bg-color-page);
    color: var(--el-text-color-placeholder);
  }
  &--today {
    background: rgba(#0a84ff, 0.06);
    .cal-day__num {
      color: #0a84ff;
      font-weight: 700;
    }
  }
  &__num {
    padding: 2px 6px;
    font-size: 13px;
    color: var(--el-text-color-secondary);
  }
  &__items {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-top: 2px;
  }
}

.cal-event {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  border-left: 3px solid;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  &__time {
    font-size: 10px;
    color: var(--el-text-color-placeholder);
    margin-right: 2px;
  }
  &__title {
  }
  &--week {
    margin-bottom: 2px;
  }
}

.cal-week {
  @include glass;
  border: 1px solid var(--el-border-color);
  border-radius: $radius-lg;
  &__header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-bottom: 1px solid var(--el-border-color);
  }
  &__col-header {
    text-align: center;
    padding: 8px 0;
    font-size: 13px;
    color: var(--el-text-color-secondary);
    &.is-today {
      color: #0a84ff;
      font-weight: 600;
    }
  }
  &__date {
    font-size: 20px;
    font-weight: 500;
  }
  &__body {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
  }
  &__col {
    padding: 6px 4px;
    min-height: 200px;
    border-right: 1px solid var(--el-border-color-light);
    &:last-child {
      border-right: none;
    }
    &.is-today {
      background: rgba(#0a84ff, 0.06);
    }
  }
}
</style>
