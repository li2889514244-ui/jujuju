<template>
  <div class="month-switcher">
    <button
      type="button"
      class="month-switcher__arrow"
      :disabled="!canGoPrev"
      aria-label="上一个月"
      @click="goPrev"
    >
      ‹
    </button>

    <el-popover
      v-model:visible="pickerVisible"
      trigger="click"
      placement="bottom"
      :width="308"
      popper-class="pl-month-picker-popper"
      @show="openPicker"
    >
      <template #reference>
        <button type="button" class="month-switcher__label" :title="label">
          {{ label }}
        </button>
      </template>

      <div class="month-picker">
        <div class="month-picker__year-row">
          <button
            type="button"
            class="month-picker__year-arrow"
            aria-label="上一年"
            @click="shiftPickerYear(-1)"
          >
            ‹
          </button>
          <span class="month-picker__year">{{ pickerYear }}年</span>
          <button
            type="button"
            class="month-picker__year-arrow"
            :disabled="pickerYear >= currentYear"
            aria-label="下一年"
            @click="shiftPickerYear(1)"
          >
            ›
          </button>
        </div>

        <div class="month-picker__grid">
          <button
            v-for="m in 12"
            :key="m"
            type="button"
            class="month-picker__month"
            :class="{
              'is-selected': pickerYear === selectedYear && m === selectedMonthIndex,
              'is-disabled': isMonthDisabled(pickerYear, m),
            }"
            :disabled="isMonthDisabled(pickerYear, m)"
            @click="pick(pickerYear, m)"
          >
            {{ m }}月
          </button>
        </div>

        <div class="month-picker__quick">
          <button type="button" class="month-picker__quick-btn" @click="pickMonth(currentMonth)">
            本月
          </button>
          <button type="button" class="month-picker__quick-btn" @click="pickMonth(prevMonth)">
            上月
          </button>
        </div>
      </div>
    </el-popover>

    <button
      type="button"
      class="month-switcher__arrow"
      :disabled="!canGoNext"
      aria-label="下一个月"
      @click="goNext"
    >
      ›
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { monthIndex, monthLabel, monthYear, shiftMonth } from '@/utils/monthRange'

const props = defineProps<{
  /** 当前选中的月份，格式 YYYY-MM */
  modelValue: string
  /** 当前自然月（上限），格式 YYYY-MM */
  currentMonth: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change', value: string): void
}>()

const pickerVisible = ref(false)
const pickerYear = ref(monthYear(props.modelValue))

const label = computed(() => monthLabel(props.modelValue))
const selectedYear = computed(() => monthYear(props.modelValue))
const selectedMonthIndex = computed(() => monthIndex(props.modelValue))
const currentYear = computed(() => monthYear(props.currentMonth))
const prevMonth = computed(() => shiftMonth(props.currentMonth, -1))
const canGoNext = computed(() => props.modelValue < props.currentMonth)
// 历史可回看，左箭头始终可用
const canGoPrev = computed(() => true)

function openPicker() {
  pickerYear.value = monthYear(props.modelValue)
}

function shiftPickerYear(delta: number) {
  pickerYear.value += delta
}

function isMonthDisabled(year: number, m: number) {
  const month = `${year}-${String(m).padStart(2, '0')}`
  return month > props.currentMonth
}

function pick(year: number, m: number) {
  pickMonth(`${year}-${String(m).padStart(2, '0')}`)
}

function pickMonth(month: string) {
  pickerVisible.value = false
  if (month === props.modelValue || month > props.currentMonth) return
  emit('update:modelValue', month)
  emit('change', month)
}

function goPrev() {
  pickMonth(shiftMonth(props.modelValue, -1))
}

function goNext() {
  if (!canGoNext.value) return
  pickMonth(shiftMonth(props.modelValue, 1))
}
</script>

<style scoped lang="scss">
.month-switcher {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid rgba($accent-400, 0.26);
  border-radius: $radius-md;
  background: rgba($bg-hover, 0.35);

  &__arrow,
  &__label {
    appearance: none;
    border: none;
    background: transparent;
    color: $text-secondary;
    cursor: pointer;
    font-family: inherit;
    line-height: 1;
    transition:
      color 0.15s $ease-out,
      background 0.15s $ease-out;
  }

  &__arrow {
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    border-radius: 6px;
    font-size: 16px;

    &:hover:not(:disabled) {
      color: $accent-200;
      background: rgba($accent-500, 0.16);
    }

    &:disabled {
      color: $text-tertiary;
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  &__label {
    min-width: 92px;
    height: 24px;
    padding: 0 8px;
    border-radius: 6px;
    color: $text-primary;
    font-size: $text-sm;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;

    &:hover {
      color: $accent-200;
      background: rgba($accent-500, 0.16);
    }
  }
}

// popover 内容被 teleport 到 body，用 :deep 命中 popper-class 保证深色样式生效
:deep(.pl-month-picker-popper.el-popover) {
  padding: $space-3;
  border-color: rgba($accent-400, 0.35);
  border-radius: $radius-lg;
  background: rgba($bg-elevated, 0.98);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.45);

  .el-popper__arrow::before {
    border-color: rgba($accent-400, 0.35);
    background: rgba($bg-elevated, 0.98);
  }
}

.month-picker {
  &__year-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $space-3;
  }

  &__year {
    color: $text-primary;
    font-size: $text-sm;
    font-weight: 800;
    letter-spacing: 0.04em;
  }

  &__year-arrow {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: $text-secondary;
    font-size: 16px;
    cursor: pointer;
    transition:
      color 0.15s $ease-out,
      background 0.15s $ease-out;

    &:hover:not(:disabled) {
      color: $accent-200;
      background: rgba($accent-500, 0.16);
    }

    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  &__month {
    padding: 8px 0;
    border: 1px solid rgba($accent-400, 0.14);
    border-radius: $radius-md;
    background: rgba($bg-hover, 0.3);
    color: $text-secondary;
    font-size: $text-xs;
    cursor: pointer;
    transition:
      border-color 0.15s $ease-out,
      background 0.15s $ease-out,
      color 0.15s $ease-out;

    &:hover:not(:disabled):not(.is-selected) {
      border-color: rgba($accent-400, 0.55);
      background: rgba($accent-500, 0.16);
      color: $accent-200;
    }

    &.is-selected {
      border-color: $accent-400;
      background: rgba($accent-500, 0.32);
      color: $accent-100;
      font-weight: 700;
    }

    &.is-disabled {
      opacity: 0.32;
      cursor: not-allowed;

      &:hover {
        border-color: rgba($accent-400, 0.14);
        background: rgba($bg-hover, 0.3);
        color: $text-secondary;
      }
    }
  }

  &__quick {
    display: flex;
    gap: $space-2;
    margin-top: $space-3;
    padding-top: $space-3;
    border-top: 1px solid rgba($border-subtle, 0.75);
  }

  &__quick-btn {
    flex: 1;
    padding: 6px 0;
    border: 1px solid rgba($accent-400, 0.22);
    border-radius: $radius-md;
    background: transparent;
    color: $accent-200;
    font-size: $text-xs;
    cursor: pointer;
    transition: background 0.15s $ease-out;

    &:hover {
      background: rgba($accent-500, 0.16);
    }
  }
}
</style>
