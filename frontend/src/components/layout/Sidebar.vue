<template>
  <div class="sidebar" :class="{ 'sidebar--collapsed': isCollapsed }">
    <!-- Logo -->
    <div class="sidebar__logo" @click="$router.push('/dashboard')">
      <div class="sidebar__logo-icon">M</div>
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
        <span class="sidebar__item-icon">{{ getIcon(r.meta?.icon) }}</span>
        <span v-if="!isCollapsed" class="sidebar__item-label">{{ r.meta?.title }}</span>
      </router-link>
    </nav>

    <!-- Bottom -->
    <div class="sidebar__bottom">
      <div class="sidebar__status" :class="{ 'sidebar__status--ok': backendOk }">
        <span class="sidebar__status-dot"></span>
        <span v-if="!isCollapsed" class="sidebar__status-text">{{ backendVersion }}</span>
      </div>
      <div class="sidebar__toggle" @click="toggleCollapse">
        <span class="sidebar__toggle-icon">{{ isCollapsed ? '›' : '‹' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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

const iconMap: Record<string, string> = {
  Odometer: '⌘', User: '👤', EditPen: '✎', Promotion: '⇧',
  DataAnalysis: '↗', Document: '▤', UserFilled: '◉', Connection: '◎',
  Aim: '◎', MagicStick: '✦', Calendar: '📅', ChatDotSquare: '💬',
}

function getIcon(name: any): string {
  return iconMap[name] || '•'
}

function toggleCollapse() { isCollapsed.value = !isCollapsed.value }
</script>

<style lang="scss" scoped>
.sidebar {
  width: 220px; height: 100vh;
  background: rgba(28, 28, 30, 0.9);
  backdrop-filter: blur(60px) saturate(200%);
  -webkit-backdrop-filter: blur(60px) saturate(200%);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex; flex-direction: column;
  transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  flex-shrink: 0; z-index: 10;
  user-select: none;

  &--collapsed { width: 68px; }

  &__logo {
    height: 56px; display: flex; align-items: center; gap: 10px;
    padding: 0 18px; cursor: pointer;
    &-icon {
      width: 30px; height: 30px; border-radius: 6px;
      background: #409eff; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 14px; flex-shrink: 0;
    }
    &-text { font-size: 16px; font-weight: 600; color: #fff; white-space: nowrap; }
  }

  &__menu {
    overflow-y: auto; padding: 8px 10px;
    display: flex; flex-direction: column; gap: 2px;
    flex: 1;
  }

  &__item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: 8px;
    color: rgba(255, 255, 255, 0.65); text-decoration: none;
    font-size: 14px; font-weight: 450;
    transition: all 0.2s ease;
    white-space: nowrap;

    &:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
    &--active {
      background: rgba(64, 158, 255, 0.15); color: #409eff; font-weight: 540;
      &:hover { background: rgba(64, 158, 255, 0.22); }
    }
    &-icon { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
    &-label { overflow: hidden; text-overflow: ellipsis; }
  }

  &__accounts {
    flex: 1; overflow-y: auto; padding: 8px 12px;
    border-top: 1px solid rgba(255,255,255,0.08); margin-top: 4px;
  }
  &__section-title {
    font-size: 11px; color: rgba(255,255,255,0.35); text-transform: uppercase;
    padding: 8px 0 6px; letter-spacing: 0.5px;
  }
  &__acc-group { margin-bottom: 6px; }
  &__platform-name {
    font-size: 10px; color: rgba(255,255,255,0.3); padding: 2px 0; text-transform: uppercase;
  }
  &__acc-item {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 8px; border-radius: 6px; cursor: pointer;
    transition: background 0.15s;
    &:hover { background: rgba(255,255,255,0.06); }
    &--active { background: rgba(64,158,255,0.1); }
  }
  &__acc-avatar { flex-shrink: 0; }
  &__acc-name {
    flex: 1; font-size: 13px; color: rgba(255,255,255,0.75);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  &__acc-followers {
    font-size: 11px; color: rgba(255,255,255,0.35); flex-shrink: 0;
  }

  &__bottom {
    padding: 12px 10px; border-top: 1px solid rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: space-between;
  }
  &__status {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; border-radius: 20px;
    background: rgba(255, 69, 58, 0.1);
    &--ok { background: rgba(48, 209, 88, 0.1); }
    &-dot { width: 6px; height: 6px; border-radius: 50%; background: #ff453a; }
    &--ok &-dot { background: #30d158; }
    &-text { font-size: 11px; color: rgba(255,255,255,0.45); }
  }
  &__toggle {
    width: 32px; height: 32px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: rgba(255,255,255,0.45);
    transition: all 0.2s;
    &:hover { background: rgba(255,255,255,0.08); color: #fff; }
    &-icon { font-size: 20px; font-weight: 300; }
  }
}
</style>
