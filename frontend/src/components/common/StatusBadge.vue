<template>
  <el-tag :type="tagType" :effect="effect" :size="size" :round="round">
    {{ label }}
  </el-tag>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    status: string
    type?: 'cookie' | 'publish' | 'browser' | 'member'
    effect?: 'dark' | 'light' | 'plain'
    size?: 'large' | 'default' | 'small'
    round?: boolean
  }>(),
  { type: 'publish', effect: 'light', size: 'default', round: false },
)

const statusConfig: Record<string, Record<string, { type: string; label: string }>> = {
  cookie: {
    valid: { type: 'success', label: '有效' },
    expired: { type: 'danger', label: '已过期' },
    unknown: { type: 'info', label: '未知' },
  },
  publish: {
    draft: { type: 'info', label: '草稿' },
    ready: { type: 'warning', label: '待发布' },
    publishing: { type: 'warning', label: '发布中' },
    pending: { type: 'warning', label: '等待中' },
    success: { type: 'success', label: '成功' },
    published: { type: 'success', label: '已发布' },
    failed: { type: 'danger', label: '失败' },
  },
  browser: {
    active: { type: 'success', label: '活跃' },
    idle: { type: 'warning', label: '空闲' },
    closed: { type: 'info', label: '已关闭' },
  },
  member: {
    owner: { type: 'danger', label: '所有者' },
    admin: { type: 'warning', label: '管理员' },
    member: { type: 'info', label: '成员' },
  },
}

const config = computed(() => {
  return statusConfig[props.type]?.[props.status] || { type: 'info', label: props.status }
})

const tagType = computed(() => config.value.type as 'success' | 'warning' | 'danger' | 'info')
const label = computed(() => config.value.label)
</script>
