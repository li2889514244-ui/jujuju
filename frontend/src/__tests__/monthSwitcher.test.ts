import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import MonthSwitcher from '@/components/common/MonthSwitcher.vue'

/** 测试环境 stub el-popover：始终渲染 reference + 内容，避免 jsdom 中 Popper 依赖问题 */
const ElPopoverStub = defineComponent({
  name: 'ElPopover',
  props: { visible: { type: Boolean, default: false } },
  emits: ['update:visible'],
  template: '<div class="popover-stub"><slot name="reference" /><slot /></div>',
})

function mountSwitcher(modelValue: string, currentMonth: string) {
  return mount(MonthSwitcher, {
    props: { modelValue, currentMonth },
    global: {
      stubs: { ElPopover: ElPopoverStub },
    },
  })
}

describe('MonthSwitcher 组件', () => {
  it('展示当前月份标题：2026年09月', () => {
    const wrapper = mountSwitcher('2026-09', '2026-09')
    expect(wrapper.find('.month-switcher__label').text()).toBe('2026年09月')
  })

  it('左箭头：2026-09 -> 2026-08（含跨年 2026-01 -> 2025-12）', async () => {
    const wrapper = mountSwitcher('2026-09', '2026-09')
    const prev = wrapper.find('.month-switcher__arrow[aria-label="上一个月"]')
    await prev.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2026-08'])
    expect(wrapper.emitted('change')?.[0]).toEqual(['2026-08'])

    const jan = mountSwitcher('2026-01', '2026-09')
    await jan.find('.month-switcher__arrow[aria-label="上一个月"]').trigger('click')
    expect(jan.emitted('update:modelValue')?.[0]).toEqual(['2025-12'])
  })

  it('右箭头：当前月禁用，不能进入未来月份', async () => {
    const wrapper = mountSwitcher('2026-09', '2026-09')
    const next = wrapper.find('.month-switcher__arrow[aria-label="下一个月"]')
    expect(next.attributes('disabled')).toBeDefined()
    await next.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('右箭头：历史月可前进（2026-08 -> 2026-09）', async () => {
    const wrapper = mountSwitcher('2026-08', '2026-09')
    const next = wrapper.find('.month-switcher__arrow[aria-label="下一个月"]')
    expect(next.attributes('disabled')).toBeUndefined()
    await next.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2026-09'])
  })

  it('弹窗：未来月份置灰，当前月高亮，点击可选历史月', async () => {
    const wrapper = mountSwitcher('2026-09', '2026-09')
    const monthButtons = wrapper.findAll('.month-picker__month')
    expect(monthButtons).toHaveLength(12)
    // 2026-09 当前月高亮
    expect(monthButtons[8].classes()).toContain('is-selected')
    // 未来 10/11/12 月禁用
    expect(monthButtons[9].attributes('disabled')).toBeDefined()
    expect(monthButtons[10].attributes('disabled')).toBeDefined()
    expect(monthButtons[11].attributes('disabled')).toBeDefined()
    // 历史月 1-8 月可选
    expect(monthButtons[0].attributes('disabled')).toBeUndefined()
    // 点击 7 月
    await monthButtons[6].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2026-07'])
  })

  it('弹窗：切换年份后，该年所有月份都可用（2025 年无未来月）', async () => {
    const wrapper = mountSwitcher('2026-09', '2026-09')
    // 打开弹窗后年份为 2026
    const yearText = wrapper.find('.month-picker__year')
    expect(yearText.text()).toBe('2026年')
    // 上一年
    await wrapper.find('.month-picker__year-arrow[aria-label="上一年"]').trigger('click')
    expect(yearText.text()).toBe('2025年')
    // 2025 年没有任何未来月，12 月可选
    const monthButtons = wrapper.findAll('.month-picker__month')
    expect(monthButtons.every((button) => button.attributes('disabled') === undefined)).toBe(true)
    // 直接选 2025-12
    await monthButtons[11].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2025-12'])
  })

  it('弹窗：下一年箭头不允许超过当前年', () => {
    const wrapper = mountSwitcher('2026-09', '2026-09')
    const nextYear = wrapper.find('.month-picker__year-arrow[aria-label="下一年"]')
    expect(nextYear.attributes('disabled')).toBeDefined()
  })

  it('快捷入口：本月 / 上月', async () => {
    const wrapper = mountSwitcher('2026-07', '2026-09')
    const quickButtons = wrapper.findAll('.month-picker__quick-btn')
    await quickButtons[0].trigger('click') // 本月
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2026-09'])
    await quickButtons[1].trigger('click') // 上月
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['2026-08'])
  })

  it('点击已选月份不重复触发 change', async () => {
    const wrapper = mountSwitcher('2026-09', '2026-09')
    await wrapper.find('.month-picker__month.is-selected').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('切换月份后标题同步更新', async () => {
    const wrapper = mountSwitcher('2026-08', '2026-09')
    await wrapper.setProps({ modelValue: '2026-07' })
    await nextTick()
    expect(wrapper.find('.month-switcher__label').text()).toBe('2026年07月')
  })
})
