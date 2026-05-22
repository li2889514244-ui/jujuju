<template>
  <div class="sidebar" :class="{ 'sidebar--collapsed': isCollapsed }">
    <!-- Logo -->
    <div class="sidebar__logo" @click="$router.push('/dashboard')">
      <div class="sidebar__logo-icon">
        <svg viewBox="0 0 32 32" fill="none" width="22" height="22">
          <defs>
            <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#00d4ff"/>
              <stop offset="100%" stop-color="#7c3aed"/>
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="7" fill="url(#lg)" />
          <path d="M10 22V10l12 6-12 6z" fill="#fff" opacity="0.9" />
        </svg>
      </div>
      <span v-if="!isCollapsed" class="sidebar__logo-text gradient-text">披星云</span>
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
      <div
        class="sidebar__theme-toggle"
        @click="toggleTheme"
        :title="isLight ? '切换深色' : '切换浅色'"
      >
        <el-icon :size="16">
          <Sunny v-if="isLight" />
          <Moon v-else />
        </el-icon>
      </div>
      <el-tooltip :content="isCollapsed ? '展开' : '收起'" placement="right">
        <div class="sidebar__toggle" @click="toggleCollapse">
          <el-icon :size="16" class="sidebar__toggle-icon">
            <component :is="isCollapsed ? Expand : Fold" />
          </el-icon>
        </div>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, markRaw, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Monitor,
  User,
  EditPen,
  Promotion,
  TrendCharts,
  Document,
  UserFilled,
  Connection,
  Aim,
  MagicStick,
  Calendar,
  Fold,
  Expand,
  Sunny,
  Moon,
  Money,
} from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'

const { isLight, toggle: toggleTheme } = useTheme()
const route = useRoute()
const router = useRouter()
const isCollapsed = ref(false)
const backendVersion = ref('v0.1')
const backendOk = ref(true)

// Auto-collapse sidebar on narrow screens (< 1200px)
function checkViewport() {
  const narrow = window.innerWidth < 1200
  isCollapsed.value = narrow
}

function toggleCollapse() {
  // Only allow manual toggle on wide screens
  if (window.innerWidth >= 1200) {
    isCollapsed.value = !isCollapsed.value
  }
}

onMounted(async () => {
  checkViewport()
  window.addEventListener('resize', checkViewport)
  try {
    const base = (import.meta as any).env?.VITE_API_BASE_URL || ''
    const url = base ? base.replace(/\/api\/v1$/, '') + '/api/v1/health' : '/api/v1/health'
    const resp = await fetch(url)
    const json = await resp.json()
    backendVersion.value = json.data?.version || '0.1.0'
    backendOk.value = json.data?.status === 'ok'
  } catch {
    backendVersion.value = '离线'
    backendOk.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', checkViewport)
})

const activeMenu = computed(() => route.path)

const menuRoutes = computed(() => {
  const mainRoute = router.options.routes.find((r) => r.path === '/')
  return (mainRoute?.children || []).filter((r) => !r.meta?.hidden)
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
  Money: markRaw(Money),
}

function getIcon(name: unknown): Component {
  return typeof name === 'string' && iconMap[name] ? iconMap[name] : Monitor
}
</script>

<style lang="scss" scoped>
.sidebar {
  width: 220px;
  height: 100vh;
  background: linear-gradient(180deg, rgba(13, 18, 37, 0.95) 0%, rgba(10, 14, 26, 0.98) 100%);
  border-right: 1px solid $color-border;
  box-shadow: 1px 0 12px rgba(0, 0, 0, 0.3), 1px 0 0 rgba(0, 212, 255, 0.05);
  display: flex;
  flex-direction: column;
  transition: width 0.3s $ease-out;
  flex-shrink: 0;
  z-index: 10;
  user-select: none;

  &--collapsed { width: 68px; }

  &__logo {
    height: 56px;
    display: flex;
    align-items: center;
    gap: $space-sm;
    padding: 0 18px;
    cursor: pointer;
    border-bottom: 1px solid $color-border;
    &-icon {
      width: 28px; height: 28px;
      border-radius: 7px;
      flex-shrink: 0;
      filter: drop-shadow(0 0 6px rgba(0, 212, 255, 0.3));
    }
    &-text {
      font-size: $text-title;
      font-weight: 700;
      white-space: nowrap;
      letter-spacing: 0.02em;
    }
  }

  &__menu {
    overflow-y: auto;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: $space-sm;
    padding: $space-sm 12px;
    border-radius: 8px;
    color: $color-text-secondary;
    text-decoration: none;
    font-size: $text-body;
    font-weight: 450;
    transition: all 0.25s $ease-out;
    white-space: nowrap;
    position: relative;

    &:hover {
      background: rgba(0, 212, 255, 0.06);
      color: $color-text-primary;
    }
    &--active {
      background: rgba(0, 212, 255, 0.1);
      color: $color-cyan;
      font-weight: 540;
      box-shadow: inset 0 0 0 1px rgba(0, 212, 255, 0.15);
      &:hover { background: rgba(0, 212, 255, 0.14); }
    }
    &-icon { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
    &-label { overflow: hidden; text-overflow: ellipsis; }
  }

  &__bottom {
    padding: 12px 10px;
    border-top: 1px solid $color-border;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }
  &__status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 20px;
    background: rgba(255, 51, 102, 0.08);
    &--ok { background: rgba(0, 227, 150, 0.08); }
    &-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: $color-pink;
      box-shadow: 0 0 6px rgba(255, 51, 102, 0.5);
    }
    &--ok &-dot {
      background: $color-green;
      box-shadow: 0 0 6px rgba(0, 227, 150, 0.5);
    }
    &-text { font-size: $text-micro; color: $color-text-tertiary; }
  }
  &__theme-toggle, &__toggle {
    width: 32px; height: 32px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: $color-text-tertiary;
    transition: all 0.2s; flex-shrink: 0;
    &:hover {
      background: rgba(0, 212, 255, 0.06);
      color: $color-text-primary;
    }
  }
  &__toggle-icon { font-size: $text-headline; font-weight: 300; }
}
</style>
