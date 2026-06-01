<template>
  <!-- Mobile hamburger toggle -->
  <div v-if="isMobile" class="sidebar__hamburger" @click="drawerVisible = true">
    <el-icon :size="22"><Expand /></el-icon>
  </div>

  <!-- Mobile drawer (rendered as overlay) -->
  <el-drawer
    v-model="drawerVisible"
    direction="ltr"
    size="240px"
    :with-header="false"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    class="sidebar-drawer"
  >
    <div class="sidebar sidebar--drawer">
      <!-- Logo -->
      <div class="sidebar__logo" @click="navTo('/dashboard'); drawerVisible = false">
        <div class="sidebar__logo-mark">
          <svg viewBox="0 0 28 28" fill="none" width="20" height="20">
            <rect width="28" height="28" rx="6" fill="#d49b50" />
            <path d="M9 20V8l10 6-10 6z" fill="#f5f0e8" opacity="0.92" />
          </svg>
        </div>
        <span class="sidebar__logo-text">披星云</span>
      </div>

      <!-- Menu -->
      <nav class="sidebar__menu">
        <router-link
          v-for="r in menuRoutes"
          :key="r.path"
          :to="'/' + r.path"
          class="sidebar__item"
          :class="{ 'sidebar__item--active': activeMenu === '/' + r.path }"
          @click="drawerVisible = false"
        >
          <el-icon :size="18" class="sidebar__item-icon">
            <component :is="getIcon(r.meta?.icon)" />
          </el-icon>
          <span class="sidebar__item-label">{{ r.meta?.title }}</span>
          <span v-if="activeMenu === '/' + r.path" class="sidebar__item-indicator"></span>
        </router-link>
      </nav>

      <!-- Bottom -->
      <div class="sidebar__bottom">
        <div class="sidebar__status" :class="{ 'sidebar__status--ok': backendOk }">
          <span class="sidebar__status-dot"></span>
          <span class="sidebar__status-text">{{ backendVersion }}</span>
        </div>
      </div>
    </div>
  </el-drawer>

  <!-- Desktop sidebar -->
  <div v-if="!isMobile" class="sidebar" :class="{ 'sidebar--collapsed': isCollapsed }">
    <!-- Logo -->
    <div class="sidebar__logo" @click="$router.push('/dashboard')">
      <div class="sidebar__logo-mark">
        <svg viewBox="0 0 28 28" fill="none" width="20" height="20">
          <rect width="28" height="28" rx="6" fill="#d49b50" />
          <path d="M9 20V8l10 6-10 6z" fill="#f5f0e8" opacity="0.92" />
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
        <span v-if="!isCollapsed && activeMenu === '/' + r.path" class="sidebar__item-indicator"></span>
      </router-link>
    </nav>

    <!-- Bottom -->
    <div class="sidebar__bottom">
      <div class="sidebar__status" :class="{ 'sidebar__status--ok': backendOk }">
        <span class="sidebar__status-dot"></span>
        <span v-if="!isCollapsed" class="sidebar__status-text">{{ backendVersion }}</span>
      </div>
      <div class="sidebar__toggle" @click="toggleCollapse" :title="isCollapsed ? '展开' : '收起'">
        <el-icon :size="16">
          <component :is="isCollapsed ? Expand : Fold" />
        </el-icon>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, markRaw, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Monitor, User, EditPen, Promotion, TrendCharts, Document, UserFilled,
  Connection, Aim, MagicStick, Calendar, Fold, Expand, Money, VideoCamera,
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const isCollapsed = ref(false)
const backendVersion = ref('v0.1')
const backendOk = ref(true)
const drawerVisible = ref(false)

// Mobile detection (threshold: 768px)
const isMobile = ref(false)

function checkViewport() {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) {
    if (window.innerWidth < 1200) {
      isCollapsed.value = true
    } else {
      isCollapsed.value = false
    }
  }
}

function toggleCollapse() {
  if (window.innerWidth >= 1200) {
    isCollapsed.value = !isCollapsed.value
  }
}

function navTo(path: string) {
  router.push(path)
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
  Odometer: markRaw(Monitor), User: markRaw(User), EditPen: markRaw(EditPen),
  Promotion: markRaw(Promotion), DataAnalysis: markRaw(TrendCharts),
  Document: markRaw(Document), UserFilled: markRaw(UserFilled),
  Connection: markRaw(Connection), Aim: markRaw(Aim),
  MagicStick: markRaw(MagicStick), Calendar: markRaw(Calendar),
  ChatDotSquare: markRaw(MagicStick), Money: markRaw(Money),
  VideoCamera: markRaw(VideoCamera),
}

function getIcon(name: unknown): Component {
  return typeof name === 'string' && iconMap[name] ? iconMap[name] : Monitor
}
</script>

<style lang="scss" scoped>
// Hamburger button (mobile only)
.sidebar__hamburger {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 1001;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(32, 29, 27, 0.95);
  border: 1px solid $color-border;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: $color-bronze;
  transition: all 0.2s;
  backdrop-filter: blur(12px);

  &:hover {
    background: rgba(40, 37, 34, 0.98);
    color: $color-cream;
  }
}

.sidebar {
  width: $sidebar-width;
  height: 100vh;
  background: linear-gradient(180deg, rgba(32, 29, 27, 0.95) 0%, rgba(26, 24, 23, 0.98) 100%);
  border-right: 1px solid $color-border;
  display: flex;
  flex-direction: column;
  transition: width 0.3s $ease-out;
  flex-shrink: 0;
  z-index: 10;
  user-select: none;

  &--collapsed { width: $sidebar-collapsed-width; }

  &--drawer {
    background: linear-gradient(180deg, rgba(32, 29, 27, 0.98) 0%, rgba(26, 24, 23, 0.99) 100%);
    border-right: none;
  }

  &__logo {
    height: 56px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 18px;
    cursor: pointer;
    border-bottom: 1px solid $color-border;

    &-mark {
      width: 28px; height: 28px;
      border-radius: 6px;
      flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    &-text {
      font-family: $font-display;
      font-size: 18px;
      font-weight: 600;
      color: $color-cream;
      white-space: nowrap;
      letter-spacing: 0.02em;
    }
  }

  &__menu {
    overflow-y: auto;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 7px;
    color: $color-text-secondary;
    text-decoration: none;
    font-size: 14px;
    font-weight: 450;
    transition: all 0.2s $ease-out;
    white-space: nowrap;
    position: relative;

    &:hover {
      background: rgba(212, 155, 80, 0.06);
      color: $color-text-primary;
    }
    &--active {
      background: rgba(212, 155, 80, 0.1);
      color: $color-bronze;
      font-weight: 500;
      .sidebar__item-icon { color: $color-bronze; }
    }
    &-icon { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
    &-label { overflow: hidden; text-overflow: ellipsis; }
    &-indicator {
      position: absolute;
      right: 10px;
      width: 4px; height: 4px;
      border-radius: 50%;
      background: $color-bronze;
    }
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
    padding: 5px 10px;
    border-radius: 20px;
    background: rgba(212, 83, 74, 0.08);
    &--ok { background: rgba(107, 158, 108, 0.08); }
    &-dot {
      width: 5px; height: 5px; border-radius: 50%;
      background: $color-rust;
    }
    &--ok &-dot { background: $color-sage; }
    &-text {
      font-size: $text-micro;
      color: $color-text-tertiary;
      font-family: $font-mono;
    }
  }
  &__toggle {
    width: 32px; height: 32px; border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: $color-text-tertiary;
    transition: all 0.2s; flex-shrink: 0;
    &:hover {
      background: rgba(212, 155, 80, 0.06);
      color: $color-text-primary;
    }
  }
}
</style>

<!-- Non-scoped styles for the el-drawer overlay -->
<style lang="scss">
.sidebar-drawer {
  background: linear-gradient(180deg, rgba(32, 29, 27, 0.98) 0%, rgba(26, 24, 23, 0.99) 100%) !important;
  border-right: 1px solid $color-border;

  .el-drawer__body {
    padding: 0;
    height: 100%;
    overflow: hidden;
  }
}
</style>
