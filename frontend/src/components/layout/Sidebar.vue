<template>
  <div class="sidebar" :class="{ 'sidebar--collapsed': isCollapsed }">
    <!-- Logo -->
    <div class="sidebar__logo" @click="$router.push('/dashboard')">
      <div class="sidebar__logo-icon">M</div>
      <span v-if="!isCollapsed" class="sidebar__logo-text">MatrixFlow</span>
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
  Aim: '◎', MagicStick: '✦',
}

function getIcon(name: any): string {
  return iconMap[name] || '•'
}

function toggleCollapse() { isCollapsed.value = !isCollapsed.value }
</script>

<style lang="scss" scoped>
@import '@/assets/styles/variables';

.sidebar {
  width: $sidebar-width; height: 100vh;
  @include glass-heavy;
  border-right: 1px solid $color-border;
  display: flex; flex-direction: column;
  transition: width 0.3s $ease-out;
  flex-shrink: 0; z-index: 10;
  user-select: none;

  &--collapsed { width: $sidebar-collapsed-width; }

  &__logo {
    height: 56px; display: flex; align-items: center; gap: 10px;
    padding: 0 18px; cursor: pointer;
    &-icon {
      width: 30px; height: 30px; border-radius: $radius-sm;
      background: $color-blue; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 14px; flex-shrink: 0;
    }
    &-text { font-size: 16px; font-weight: 600; color: $color-text-primary; white-space: nowrap; letter-spacing: -0.3px; }
  }

  &__menu {
    flex: 1; overflow-y: auto; padding: 8px 10px;
    display: flex; flex-direction: column; gap: 2px;
  }

  &__item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; border-radius: $radius-md;
    color: $color-text-secondary; text-decoration: none;
    font-size: 14px; font-weight: 450;
    transition: all 0.2s $ease-out;
    white-space: nowrap;

    &:hover {
      background: rgba(255, 255, 255, 0.06);
      color: $color-text-primary;
    }

    &--active {
      background: rgba(10, 132, 255, 0.12);
      color: $color-blue;
      font-weight: 540;
      &:hover { background: rgba(10, 132, 255, 0.18); }
    }

    &-icon { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; line-height: 1; }
    &-label { overflow: hidden; text-overflow: ellipsis; }
  }

  &__bottom {
    padding: 12px 10px; border-top: 1px solid $color-separator;
    display: flex; align-items: center; justify-content: space-between;
  }

  &__status {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 10px; border-radius: $radius-full;
    background: rgba(255, 69, 58, 0.1);
    &--ok { background: rgba(48, 209, 88, 0.1); }
    &-dot { width: 6px; height: 6px; border-radius: 50%; background: $color-red; }
    &--ok &-dot { background: $color-green; }
    &-text { font-size: 11px; color: $color-text-tertiary; font-family: $font-mono; }
  }

  &__toggle {
    width: 32px; height: 32px; border-radius: $radius-sm;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: $color-text-tertiary;
    transition: all 0.2s $ease-out;
    &:hover { background: rgba(255, 255, 255, 0.06); color: $color-text-primary; }
    &-icon { font-size: 20px; font-weight: 300; }
  }
}
</style>
