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
      <!-- Tools -->
      <el-dropdown trigger="click" class="topbar__tools">
        <div class="topbar__tool-button" role="button" aria-label="工具">
          <el-icon :size="14"><MoreFilled /></el-icon>
          <span class="topbar__desktop">工具</span>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item>
              <a
                href="/downloads/pixingyun-mate-portable.zip"
                target="_blank"
                class="topbar__tool-link"
                ><el-icon :size="14"><Download /></el-icon> 下载桌面伴侣</a
              >
            </el-dropdown-item>
            <el-dropdown-item>
              <router-link to="/ai" class="topbar__tool-link">
                <el-icon :size="14"><MagicStick /></el-icon> AI 助手
              </router-link>
            </el-dropdown-item>
            <el-dropdown-item>
              <router-link to="/mcp" class="topbar__tool-link">
                <el-icon :size="14"><Connection /></el-icon> MCP 接入
              </router-link>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- Team Switcher -->
      <el-dropdown trigger="click" class="topbar__team-wrap" @command="handleTeamSwitch">
        <div class="topbar__team">
          <el-icon :size="14"><OfficeBuilding /></el-icon>
          <span class="topbar__team-name topbar__desktop">{{
            teamStore.currentTeam?.name || '选择团队'
          }}</span>
          <el-icon :size="11"><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="team in teamStore.teams"
              :key="team.id"
              :command="team"
              :class="{ 'is-active': team.id === teamStore.currentTeamId }"
              >{{ team.name }} ({{ team.memberCount }}人)</el-dropdown-item
            >
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
            <div class="topbar__icon-btn" role="button" aria-label="通知" tabindex="0">
              <el-icon :size="16"><Bell /></el-icon>
            </div>
          </el-badge>
        </template>
        <div class="notification-panel">
          <div class="notification-panel__header">
            <span>通知</span>
            <el-button
              link
              type="primary"
              size="small"
              :disabled="unreadCount === 0"
              @click="handleMarkAllRead"
              >全部已读</el-button
            >
          </div>
          <div v-loading="notifLoading" class="notification-panel__body">
            <div v-if="notifications.length === 0" class="notification-panel__empty">暂无通知</div>
            <div
              v-for="item in notifications"
              :key="item.id"
              class="notification-item"
              :class="{ 'notification-item--unread': !item.read }"
              @click="handleNotifClick(item)"
            >
              <div class="notification-item__icon">
                <el-icon :color="getNotifColor(item.type)" :size="16">
                  <component :is="getNotifIcon(item.type)" />
                </el-icon>
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
          <el-avatar :size="26" :src="userStore.avatar">
            {{ userStore.username?.charAt(0)?.toUpperCase() }}
          </el-avatar>
          <span class="topbar__username topbar__desktop">{{ userStore.username }}</span>
          <el-icon :size="11"><ArrowDown /></el-icon>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile"
              ><el-icon><User /></el-icon>个人设置</el-dropdown-item
            >
            <el-dropdown-item command="password"
              ><el-icon><Lock /></el-icon>修改密码</el-dropdown-item
            >
            <el-dropdown-item divided command="logout"
              ><el-icon><SwitchButton /></el-icon>退出登录</el-dropdown-item
            >
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
import {
  WarningFilled,
  SuccessFilled,
  InfoFilled,
  MagicStick,
  MoreFilled,
  Connection,
} from '@element-plus/icons-vue'
import { getNotificationColor } from '@/composables/usePlatform'
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
  pollTimer = setInterval(fetchUnreadCount, 30000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})

async function fetchUnreadCount() {
  try {
    const res = await notificationApi.getUnreadCount()
    unreadCount.value = res.data.unreadCount
  } catch {
    /* */
  }
}

async function fetchNotifications() {
  notifLoading.value = true
  try {
    const res = await notificationApi.getAll({ limit: 10 })
    notifications.value = res.data.notifications
    unreadCount.value = res.data.unreadCount
  } catch {
    /* */
  }
  notifLoading.value = false
}

async function handleMarkAllRead() {
  await notificationApi.markAllAsRead()
  notifications.value = notifications.value.map((n) => ({ ...n, read: true }))
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
  return getNotificationColor(type)
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr),
    now = new Date(),
    diff = now.getTime() - date.getTime(),
    minutes = Math.floor(diff / 60000)
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
.topbar {
  height: $topbar-height;
  background-color: rgba(15, 16, 24, 0.8);
  border-bottom: 1px solid $border-subtle;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
  z-index: 5;
  position: relative;
}

.topbar__left {
  flex: 1;
  min-width: 0;

  :deep(.el-breadcrumb) {
    font-size: 13px;

    .el-breadcrumb__inner {
      font-weight: 500;
    }

    .el-breadcrumb__separator {
      color: $text-placeholder;
      margin: 0 8px;
    }
  }
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.topbar__desktop {
  display: inline;
}

.topbar__tools {
  display: flex;
}

// 统一的胶囊按钮样式
%pill-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  color: $text-secondary;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 12px;
  height: 32px;
  border: 1px solid $border-base;
  border-radius: $radius-md;
  background: rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: all 0.16s $ease-out;

  &:hover {
    background: rgba(99, 102, 241, 0.08);
    border-color: rgba(99, 102, 241, 0.3);
    color: $accent-300;
  }
}

.topbar__tool-button {
  @extend %pill-btn;
}

.topbar__tool-link {
  display: flex;
  align-items: center;
  gap: 8px;
  color: $text-secondary;
  text-decoration: none;

  &:hover {
    color: $accent-300;
  }
}

.topbar__team {
  @extend %pill-btn;
}

.topbar__icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid $border-base;
  border-radius: $radius-md;
  background: rgba(255, 255, 255, 0.02);
  color: $text-secondary;
  cursor: pointer;
  transition: all 0.16s $ease-out;

  &:hover {
    color: $accent-300;
    background: rgba(99, 102, 241, 0.08);
    border-color: rgba(99, 102, 241, 0.3);
  }
}

.topbar__notification {
  cursor: pointer;

  :deep(.el-badge__content) {
    font-size: 10px;
    height: 16px;
    line-height: 14px;
    padding: 0 5px;
    background-color: $color-danger;
    border: 2px solid $bg-base;
  }
}

.topbar__user {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 3px 10px 3px 3px;
  height: 32px;
  border-radius: $radius-full;
  border: 1px solid $border-base;
  background: rgba(255, 255, 255, 0.02);
  transition: all 0.16s $ease-out;

  &:hover {
    background: rgba(99, 102, 241, 0.06);
    border-color: rgba(99, 102, 241, 0.24);
  }
}

.topbar__username {
  font-size: 13px;
  color: $text-primary;
  font-weight: 500;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// Notification panel
.notification-panel {
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 12px;
    border-bottom: 1px solid $border-subtle;
    font-weight: 600;
    font-size: 14px;
    color: $text-primary;
  }

  &__body {
    max-height: 360px;
    overflow-y: auto;
    padding-top: 6px;
  }

  &__empty {
    text-align: center;
    color: $text-tertiary;
    padding: 40px 0;
    font-size: 13px;
  }
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 8px;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: background 0.15s $ease-out;

  &:hover {
    background: rgba(99, 102, 241, 0.06);
  }

  &--unread {
    background: rgba(99, 102, 241, 0.05);
  }

  &__icon {
    padding-top: 2px;
  }

  &__content {
    flex: 1;
    min-width: 0;
  }

  &__title {
    font-size: 13px;
    color: $text-primary;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__time {
    font-size: 11px;
    color: $text-tertiary;
    margin-top: 2px;
  }
}

// Mobile
@media (max-width: 768px) {
  .topbar {
    padding: 0 12px;
    &__right {
      gap: 6px;
    }
    &__desktop {
      display: none !important;
    }
    &__team-name {
      display: none !important;
    }
    &__team {
      padding: 0 8px;
    }
    &__tool-button {
      padding: 0 8px;
    }
    &__user {
      padding: 3px;
    }
    &__left {
      padding-left: 44px;
      :deep(.el-breadcrumb__item:first-child .el-breadcrumb__inner) {
        display: none;
      }
      :deep(.el-breadcrumb__separator:first-of-type) {
        display: none;
      }
    }
  }
}
</style>
