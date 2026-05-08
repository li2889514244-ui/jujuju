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
      <el-badge :value="unreadCount" :hidden="unreadCount === 0" class="topbar__notification">
        <el-icon :size="20" class="topbar__icon" role="button" aria-label="通知" tabindex="0"><Bell /></el-icon>
      </el-badge>

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
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import { useTeamStore } from '@/store/team'
import type { Team } from '@/types'

const route = useRoute()
const userStore = useUserStore()
const teamStore = useTeamStore()
const unreadCount = ref(3)

const currentRoute = computed(() => route)

onMounted(() => {
  teamStore.fetchTeams()
})

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
      // Navigate to settings
      break
  }
}
</script>

<style lang="scss" scoped>
.topbar {
  height: $topbar-height;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  flex-shrink: 0;

  &__right {
    display: flex;
    align-items: center;
    gap: 20px;
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
</style>
