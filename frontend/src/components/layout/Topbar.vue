<template>
  <div class="topbar">
    <div class="topbar__left">
      <el-breadcrumb separator="›">
        <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
        <el-breadcrumb-item v-if="currentRoute?.meta?.title">
          {{ currentRoute.meta.title }}
        </el-breadcrumb-item>
      </el-breadcrumb>
    </div>

    <div class="topbar__right">
      <!-- Mobile: "More" menu -->
      <el-dropdown trigger="click" class="topbar__more">
        <el-icon :size="20" class="topbar__icon-btn" role="button" aria-label="更多">
          <MoreFilled />
        </el-icon>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item>
              <a
                href="https://github.com/li2889514244-ui/pixingyun-desktop/archive/refs/heads/main.zip"
                target="_blank"
                class="topbar__more-link"
              >
                <el-icon :size="16"><Download /></el-icon> 桌面端
              </a>
            </el-dropdown-item>
            <el-dropdown-item>
              <router-link to="/ai" class="topbar__more-link">
                <el-icon :size="16"><MagicStick /></el-icon> AI 助手
              </router-link>
            </el-dropdown-item>
            <el-dropdown-item>
              <router-link to="/mcp" class="topbar__more-link">
                <el-icon :size="16"><ChatDotRound /></el-icon> MCP 查询
              </router-link>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>

      <!-- Desktop: action items -->
      <el-tooltip content="下载桌面伴侣" placement="bottom" class="topbar__desktop">
        <a
          href="https://github.com/li2889514244-ui/pixingyun-desktop/archive/refs/heads/main.zip"
          target="_blank"
          class="topbar__action"
        >
          <el-icon :size="18"><Download /></el-icon>
          <span>桌面端</span>
        </a>
      </el-tooltip>

      <router-link to="/ai" class="topbar__action topbar__desktop" title="AI 助手">
        <el-icon :size="18"><MagicStick /></el-icon>
        <span>AI 助手</span>
      </router-link>

      <router-link to="/mcp" class="topbar__action topbar__desktop" title="MCP 数据查询">
        <el-icon :size="18"><ChatDotRound /></el-icon>
        <span>MCP 查询</span>
      </router-link>

      <!-- Team Switcher -->
      <el-dropdown trigger="click" class="topbar__team-wrap" @command="handleTeamSwitch">
        <div class="topbar__team">
          <el-icon :size="16"><OfficeBuilding /></el-icon>
          <span class="topbar__team-name">{{ teamStore.currentTeam?.name || '选择团队' }}</span>
          <el-icon :size="12"><ArrowDown /></el-icon>
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
            <el-icon
              :size="19"
              class="topbar__icon-btn"
              role="button"
              aria-label="通知"
              tabindex="0"
            >
              <Bell />
            </el-icon>
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
          <el-avatar :size="30" :src="userStore.avatar">
            {{ userStore.username?.charAt(0)?.toUpperCase() }}
          </el-avatar>
          <span class="topbar__username topbar__desktop">{{ userStore.username }}</span>
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
import {
  WarningFilled,
  SuccessFilled,
  InfoFilled,
  MagicStick,
  ChatDotRound,
  MoreFilled,
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
    /* silent */
  }
}

async function fetchNotifications() {
  notifLoading.value = true
  try {
    const res = await notificationApi.getAll({ limit: 10 })
    notifications.value = res.data.notifications
    unreadCount.value = res.data.unreadCount
  } catch {
    /* silent */
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

function getNotifColor(type: string): string {
  return getNotificationColor(type)
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
.topbar {
  height: $topbar-height;
  background: $color-bg-secondary;
  border-bottom: 1px solid $color-border;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  flex-shrink: 0;
  z-index: 5;

  &__left {
    :deep(.el-breadcrumb) {
      font-size: 13px;
      .el-breadcrumb__item {
        color: $color-text-tertiary;
      }
      .el-breadcrumb__inner {
        color: $color-text-secondary;
        font-weight: 400;
      }
      .el-breadcrumb__separator {
        color: $color-text-tertiary;
        margin: 0 6px;
      }
    }
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  &__more {
    display: none;
  }

  &__desktop {
    display: flex;
  }

  &__more-link {
    display: flex;
    align-items: center;
    gap: 8px;
    color: $color-text-secondary;
    text-decoration: none;
    &:hover {
      color: $color-bronze;
    }
  }

  &__team-wrap {
    &:deep(.topbar__team-name) {
      display: inline;
    }
  }

  &__action {
    display: flex;
    align-items: center;
    gap: 5px;
    color: $color-text-secondary;
    text-decoration: none;
    font-size: 13px;
    padding: 5px 10px;
    border-radius: 6px;
    transition: all 0.2s;
    &:hover {
      background: rgba(212, 155, 80, 0.06);
      color: $color-bronze;
    }
  }

  &__team {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: $color-text-secondary;
    font-size: 13px;
    padding: 6px 12px;
    border-radius: 6px;
    transition: all 0.2s;
    &:hover {
      background: rgba(212, 155, 80, 0.06);
    }
  }

  &__notification {
    cursor: pointer;
    :deep(.el-badge__content) {
      font-size: 10px;
      height: 16px;
      line-height: 16px;
      padding: 0 4px;
    }
  }

  &__icon-btn {
    color: $color-text-secondary;
    cursor: pointer;
    transition: color 0.2s;
    &:hover {
      color: $color-bronze;
    }
  }

  &__user {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 4px 8px 4px 4px;
    border-radius: 9999px;
    transition: background 0.2s;
    &:hover {
      background: rgba(212, 155, 80, 0.06);
    }
  }
  &__username {
    font-size: 13px;
    color: $color-text-primary;
    font-weight: 450;
  }
}

// Notification panel
.notification-panel {
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 12px;
    border-bottom: 1px solid $color-border;
    font-weight: 500;
    font-size: 14px;
  }
  &__body {
    max-height: 360px;
    overflow-y: auto;
    padding-top: 8px;
  }
  &__empty {
    text-align: center;
    color: $color-text-tertiary;
    padding: 40px 0;
    font-size: 13px;
  }
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  &:hover {
    background: rgba(212, 155, 80, 0.05);
  }
  &--unread {
    background: rgba(212, 155, 80, 0.06);
  }
  &__icon {
    padding-top: 1px;
  }
  &__content {
    flex: 1;
    min-width: 0;
  }
  &__title {
    font-size: 13px;
    color: $color-text-primary;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__time {
    font-size: 12px;
    color: $color-text-tertiary;
    margin-top: 2px;
  }
}

// Mobile: compact topbar
@media (max-width: 768px) {
  .topbar {
    padding: 0 12px;
    &__right {
      gap: 8px;
    }
    &__more {
      display: flex;
    }
    &__desktop {
      display: none !important;
    }
    &__team-name {
      display: none !important;
    }
    &__team {
      padding: 6px 8px;
    }
    &__user {
      padding: 2px;
    }
    &__left {
      padding-left: 48px; // make room for sidebar hamburger
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
