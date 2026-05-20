<template>
  <div class="sidebar" :class="{ 'sidebar--collapsed': isCollapsed }">
    <!-- Logo -->
    <div class="sidebar__logo" @click="$router.push('/dashboard')">
      <div class="sidebar__logo-icon">
        <svg viewBox="0 0 32 32" fill="none" width="22" height="22">
          <rect width="32" height="32" rx="7" fill="#0a84ff"/>
          <path d="M10 22V10l12 6-12 6z" fill="#fff"/>
        </svg>
      </div>
      <span v-if="!isCollapsed" class="sidebar__logo-text">披星云</span>
    </div>

    <!-- Menu -->
    <nav class="sidebar__menu">
      <router-link
        v-for="r in menuRoutes"
        :key="r.path"
        :to="'/' + r.path"
        class="sidebar__item"
        :class="{ 'sidebar__item--active': activeMenu === '/' + r.path }"
      >
        <el-icon :size="18" class="sidebar__item-icon">
          <component :is="getIcon(r.meta?.icon)" />
        </el-icon>
        <span v-if="!isCollapsed" class="sidebar__item-label">{{ r.meta?.title }}</span>
      </router-link>
    </nav>

    <!-- Bottom -->
    <div class="sidebar__bottom">
      <div class="sidebar__status" :class="{ 'sidebar__status--ok': backendOk }">
        <span class="sidebar__status-dot"></span>
        <span v-if="!isCollapsed" class="sidebar__status-text">{{ backendVersion }}</span>
      </div>
      <div class="sidebar__theme-toggle" @click="toggleTheme" :title="isLight ? '切换深色' : '切换浅色'">
        <el-icon :size="16">
          <Sunny v-if="isLight" />
          <Moon v-else />
        </el-icon>
      </div>
      <div class="sidebar__toggle" @click="toggleCollapse">
        <el-icon :size="16" class="sidebar__toggle-icon">
          <component :is="isCollapsed ? Expand : Fold" />
        </el-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, markRaw, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Monitor, User, EditPen, Promotion,
  TrendCharts, Document, UserFilled, Connection,
  Aim, MagicStick, Calendar, Fold, Expand,
  Sunny, Moon,
} from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'

const { isLight, toggle: toggleTheme } = useTheme()
const route = useRoute()
const router = useRouter()
const isCollapsed = ref(false)
const backendVersion = ref('v0.1')
const backendOk = ref(true)

onMounted(async () => {
  try {
    const base = (import.meta as any).env?.VITE_API_BASE_URL || ''
    const url = base ? base.replace(/\/api\/v1$/, '') + '/api/v1/health' : '/api/v1/health'
    const resp = await fetch(url)
    const json = await resp.json()
    backendVersion.value = json.data?.version || '0.1.0'
    backendOk.value = json.data?.status === 'ok'
  } catch { backendVersion.value = '离线'; backendOk.value = false }
})

const activeMenu = computed(() => route.path)

const menuRoutes = computed(() => {
  const mainRoute = router.options.routes.find(r => r.path === '/')
  return (mainRoute?.children || []).filter(r => !r.meta?.hidden)
})

const iconMap: Record<string, Component> = {
  Odometer: markRaw(Monitor),
  User: markRaw(User),
  EditPen: markRaw(EditPen),
  Promotion: markRaw(Promotion),
  DataAnalysis: markRaw(TrendCharts),
  Document: markRaw(Document),
  UserFilled: markRaw(UserFilled),
  Connection: markRaw(Connection),
  Aim: markRaw(Aim),
  MagicStick: markRaw(MagicStick),
  Calendar: markRaw(Calendar),
  ChatDotSquare: markRaw(MagicStick),
}

function getIcon(name: unknown): Component {
  return typeof name === 'string' && iconMap[name] ? iconMap[name] : Monitor
}

function toggleCollapse() { isCollapsed.value = !isCollapsed.value }
</script>

<style lang="scss" scoped>
.sidebar {
  width: 220px; height: 100vh;
  background: var(--app-bg-glass-heavy);
  backdrop-filter: blur(60px) saturate(200%);
  -webkit-backdrop-filter: blur(60px) saturate(200%);
  border-right: 1px solid var(--app-border);
  display: flex; flex-direction: column;
  transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0; z-index: 10;
  user-select: none;

  &--collapsed { width: 68px; }

  &__logo {
    height: 56px; display: flex; align-items: center; gap: 10px;
    padding: 0 18px; cursor: pointer;
    &-icon {
      width: 28px; height: 28px; border-radius: 7px;
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    &-text { font-size: 16px; font-weight: 600; color: var(--app-text-primary); white-space: nowrap; }
  }

  &__menu {
    overflow-y: auto; padding: 8px 10px;
    display: flex; flex-direction: column; gap: 2px;
    flex: 1;
  }

  &__item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: 6px;
    color: var(--app-text-secondary); text-decoration: none;
    font-size: 14px; font-weight: 450;
    transition: all 0.2s ease;
    white-space: nowrap;

    &:hover { background: var(--app-overlay-hover); color: var(--app-text-primary); }
    &--active {
      background: rgba(#0a84ff, 0.12); color: #0a84ff; font-weight: 540;
      &:hover { background: rgba(#0a84ff, 0.18); }
    }
    &-icon { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
    &-label { overflow: hidden; text-overflow: ellipsis; }
  }

  &__accounts {
    flex: 1; overflow-y: auto; padding: 8px 12px;
    border-top: 1px solid var(--app-border); margin-top: 4px;
  }
  &__section-title {
    font-size: 11px; color: var(--app-text-tertiary); text-transform: uppercase;
    padding: 8px 0 6px; letter-spacing: 0.5px;
  }
  &__acc-group { margin-bottom: 6px; }
  &__platform-name {
    font-size: 10px; color: var(--app-text-tertiary); padding: 2px 0; text-transform: uppercase;
  }
  &__acc-item {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 8px; border-radius: 6px; cursor: pointer;
    transition: background 0.15s;
    &:hover { background: var(--app-overlay-hover); }
    &--active { background: rgba(#0a84ff, 0.1); }
  }
  &__acc-avatar { flex-shrink: 0; }
  &__acc-name {
    flex: 1; font-size: 13px; color: var(--app-text-secondary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  &__acc-followers {
    font-size: 11px; color: var(--app-text-tertiary); flex-shrink: 0;
  }

  &__bottom {
    padding: 12px 10px; border-top: 1px solid var(--app-border);
    display: flex; align-items: center; justify-content: space-between;
    gap: 4px;
  }
  &__status {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; border-radius: 20px;
    background: rgba(255, 69, 58, 0.1);
    &--ok { background: rgba(48, 209, 88, 0.1); }
    &-dot { width: 6px; height: 6px; border-radius: 50%; background: #ff453a; }
    &--ok &-dot { background: #30d158; }
    &-text { font-size: 11px; color: var(--app-text-tertiary); }
  }
  &__theme-toggle {
    width: 32px; height: 32px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: var(--app-text-tertiary);
    transition: all 0.2s;
    flex-shrink: 0;
    &:hover { background: var(--app-overlay-hover); color: var(--app-text-primary); }
  }
  &__toggle {
    width: 32px; height: 32px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: var(--app-text-tertiary);
    transition: all 0.2s;
    flex-shrink: 0;
    &:hover { background: var(--app-overlay-hover); color: var(--app-text-primary); }
    &-icon { font-size: 20px; font-weight: 300; }
  }
}
</style>
