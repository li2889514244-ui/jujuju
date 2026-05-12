<template>
  <div class="topbar">
    <div class="topbar__left">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
        <el-breadcrumb-item v-if="currentRoute?.meta?.title">
          {{ currentRoute.meta.title }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </div>

    <div class="topbar__right">
      <!-- Desktop Download -->
      <el-tooltip content="下载桌面伴侣，扫码绑定平台账号" placement="bottom">
        <a href="https://github.com/li2889514244-ui/pixingyun-desktop/archive/refs/heads/master.zip" target="_blank" class="topbar__download">
          <el-icon :size="20"><Download /></el-icon>
          <span>桌面端</span>
        </a>
      </el-tooltip>

      <!-- Team Switcher -->
      <el-dropdown trigger="click" @command="handleTeamSwitch">
        <div class="topbar__team">
          <el-icon><OfficeBuilding /></el-icon>
          <span>{{ teamStore.currentTeam?.name || '选择团队' }}</span>
          <el-icon><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="team in teamStore.teams"
              :key="team.id"
              :command="team"
              :class="{ 'is-active': team.id === teamStore.currentTeamId }"
            >
              {{ team.name }} ({{ team.memberCount }}人)
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- Notifications -->
      <el-popover
        placement="bottom-end"
        :width="360"
        trigger="click"
        popper-class="notification-popover"
      >
        <template #reference>
          <el-badge :value="unreadCount" :hidden="unreadCount === 0" class="topbar__notification">
            <el-icon :size="20" class="topbar__icon" role="button" aria-label="通知" tabindex="0"><Bell /></el-icon>
          </el-badge>
        </template>
        <div class="notification-panel">
          <div class="notification-panel__header">
            <span>通知</span>
            <el-button link type="primary" size="small" @click="handleMarkAllRead" :disabled="unreadCount === 0">
              全部已读
            </el-button>
          </div>
          <div class="notification-panel__body" v-loading="notifLoading">
            <div v-if="notifications.length === 0" class="notification-panel__empty">
              暂无通知
            </div>
            <div
              v-for="item in notifications"
              :key="item.id"
              class="notification-item"
              :class="{ 'notification-item--unread': !item.read }"
              @click="handleNotifClick(item)"
            >
              <div class="notification-item__icon">
                <el-icon :color="getNotifColor(item.type)"><component :is="getNotifIcon(item.type)" /></el-icon>
              </div>
              <div class="notification-item__content">
                <div class="notification-item__title">{{ item.title }}</div>
                <div class="notification-item__time">{{ formatTime(item.createdAt) }}</div>
              </div>
            </div>
          </div>
        </div>
      </el-popover>

      <!-- User Menu -->
      <el-dropdown trigger="click" @command="handleUserCommand">
        <div class="topbar__user">
          <el-avatar :size="32" :src="userStore.avatar">
            {{ userStore.username?.charAt(0)?.toUpperCase() }}
          </el-avatar>
          <span class="topbar__username">{{ userStore.username }}</span>
          <el-icon><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile">
              <el-icon><User /></el-icon>个人设置
            </el-dropdown-item>
            <el-dropdown-item command="password">
              <el-icon><Lock /></el-icon>修改密码
            </el-dropdown-item>
            <el-dropdown-item divided command="logout">
              <el-icon><SwitchButton /></el-icon>退出登录
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import { useTeamStore } from '@/store/team'
import { notificationApi, type Notification } from '@/api/notifications'
import { WarningFilled, SuccessFilled, InfoFilled } from '@element-plus/icons-vue'
import type { Team } from '@/types'

const route = useRoute()
const userStore = useUserStore()
const teamStore = useTeamStore()
const unreadCount = ref(0)
const notifications = ref<Notification[]>([])
const notifLoading = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const currentRoute = computed(() => route)

onMounted(() => {
  teamStore.fetchTeams()
  fetchNotifications()
  // 每30秒轮询未读数
  pollTimer = setInterval(fetchUnreadCount, 30000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

async function fetchUnreadCount() {
  try {
    const res = await notificationApi.getUnreadCount()
    unreadCount.value = res.data.unreadCount
  } catch { /* silent */ }
}

async function fetchNotifications() {
  notifLoading.value = true
  try {
    const res = await notificationApi.getAll({ limit: 10 })
    notifications.value = res.data.notifications
    unreadCount.value = res.data.unreadCount
  } catch { /* silent */ }
  notifLoading.value = false
}

async function handleMarkAllRead() {
  await notificationApi.markAllAsRead()
  notifications.value = notifications.value.map(n => ({ ...n, read: true }))
  unreadCount.value = 0
}

async function handleNotifClick(item: Notification) {
  if (!item.read) {
    await notificationApi.markAsRead(item.id)
    item.read = true
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  }
}

function getNotifIcon(type: string) {
  switch (type) {
    case 'PUBLISH_FAILED':
    case 'ACCOUNT_EXPIRED':
      return WarningFilled
    case 'PUBLISH_SUCCESS':
      return SuccessFilled
    default:
      return InfoFilled
  }
}

function getNotifColor(type: string) {
  switch (type) {
    case 'PUBLISH_FAILED':
    case 'ACCOUNT_EXPIRED':
      return '#F56C6C'
    case 'PUBLISH_SUCCESS':
      return '#67C23A'
    case 'FOLLOWER_ALERT':
      return '#E6A23C'
    default:
      return '#909399'
  }
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}

function handleTeamSwitch(team: Team) {
  teamStore.switchTeam(team)
  teamStore.fetchMembers()
}

function handleUserCommand(command: string) {
  switch (command) {
    case 'logout':
      userStore.logout()
      break
    case 'profile':
    case 'password':
      break
  }
}
</script>

<style lang="scss" scoped>
@import '@/assets/styles/variables';

.topbar {
  height: $topbar-height;
  @include glass;
  border-bottom: 1px solid $color-border;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 24px; flex-shrink: 0;
  z-index: 5;

  &__right {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  &__download {
    display: flex;
    align-items: center;
    gap: 4px;
    color: #409eff;
    text-decoration: none;
    font-size: 13px;
    padding: 4px 10px;
    border-radius: 6px;
    transition: background 0.2s;
    &:hover {
      background: #ecf5ff;
    }
  }

  &__team {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: #606266;
    font-size: 14px;
    padding: 6px 12px;
    border-radius: 6px;
    transition: background 0.2s;

    &:hover {
      background: #f5f7fa;
    }
  }

  &__notification {
    cursor: pointer;
  }

  &__icon {
    color: #606266;
    cursor: pointer;
    transition: color 0.2s;

    &:hover {
      color: $primary-color;
    }
  }

  &__user {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  &__username {
    font-size: 14px;
    color: #303133;
  }
}

.notification-panel {
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 12px;
    border-bottom: 1px solid #ebeef5;
    font-weight: 600;
    font-size: 15px;
  }

  &__body {
    max-height: 360px;
    overflow-y: auto;
    padding-top: 8px;
  }

  &__empty {
    text-align: center;
    color: #909399;
    padding: 40px 0;
    font-size: 14px;
  }
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #f5f7fa;
  }

  &--unread {
    background: #ecf5ff;

    &:hover {
      background: #d9ecff;
    }
  }

  &__icon {
    padding-top: 2px;
    font-size: 18px;
  }

  &__content {
    flex: 1;
    min-width: 0;
  }

  &__title {
    font-size: 13px;
    color: #303133;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__time {
    font-size: 12px;
    color: #909399;
    margin-top: 4px;
  }
}
</style>