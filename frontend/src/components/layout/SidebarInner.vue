<template>
  <!-- Logo -->
  <div class="sidebar-inner__logo" @click="onLogoClick">
    <div class="sidebar-inner__logo-mark">
      <svg viewBox="0 0 28 28" fill="none" width="22" height="22" aria-hidden="true">
        <defs>
          <linearGradient id="mfLogoGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#818cf8" />
            <stop offset="100%" stop-color="#6366f1" />
          </linearGradient>
        </defs>
        <rect width="28" height="28" rx="8" fill="url(#mfLogoGrad)" />
        <path d="M9 20V8l10 6-10 6z" fill="#ffffff" opacity="0.96" />
      </svg>
    </div>
    <div v-if="!collapsed" class="sidebar-inner__brand">
      <span class="sidebar-inner__logo-text">披星云</span>
      <span class="sidebar-inner__logo-subtitle">Matrix Ops</span>
    </div>
  </div>

  <!-- Menu -->
  <nav class="sidebar-inner__menu">
    <div v-for="section in menuSections" :key="section.name" class="sidebar-inner__section">
      <div v-if="!collapsed" class="sidebar-inner__section-label">{{ section.name }}</div>
      <router-link
        v-for="r in section.routes"
        :key="r.path"
        :to="'/' + r.path"
        class="sidebar-inner__item"
        :class="{ 'sidebar-inner__item--active': isActiveRoute(r.path) }"
        @click="$emit('navigate')"
      >
        <el-icon :size="18" class="sidebar-inner__item-icon">
          <component :is="getIcon(r.meta?.icon)" />
        </el-icon>
        <span v-if="!collapsed" class="sidebar-inner__item-label">{{ r.meta?.title }}</span>
      </router-link>
    </div>
  </nav>

  <!-- Bottom -->
  <div class="sidebar-inner__bottom">
    <div class="sidebar-inner__status" :class="{ 'sidebar-inner__status--ok': backendOk }">
      <span class="sidebar-inner__status-dot"></span>
      <span v-if="!collapsed" class="sidebar-inner__status-text">{{ backendVersion }}</span>
      <el-icon
        v-if="!collapsed && !backendOk"
        :size="13"
        class="sidebar-inner__status-retry"
        title="重试"
        @click.stop="checkHealth"
        ><Refresh
      /></el-icon>
    </div>
    <div v-if="!collapsed" class="sidebar-inner__toggle" title="收起菜单" @click="$emit('toggle')">
      <el-icon :size="16"><Fold /></el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, markRaw, type Component } from 'vue'
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
  Money,
  VideoCamera,
  Refresh,
} from '@element-plus/icons-vue'

defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ navigate: []; toggle: [] }>()

const route = useRoute()
const router = useRouter()
const backendVersion = ref('v0.1')
const backendOk = ref(true)

onMounted(() => {
  checkHealth()
})

async function checkHealth() {
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
}

function onLogoClick() {
  router.push('/dashboard')
  emit('navigate')
}

const menuRoutes = computed(() => {
  const mainRoute = router.options.routes.find((r) => r.path === '/')
  return (mainRoute?.children || []).filter((r) => !r.meta?.hidden)
})

const menuSections = computed(() => {
  const sections = new Map<string, typeof menuRoutes.value>()
  menuRoutes.value.forEach((r) => {
    const sectionName = typeof r.meta?.section === 'string' ? r.meta.section : '其他'
    sections.set(sectionName, [...(sections.get(sectionName) || []), r])
  })
  return Array.from(sections.entries()).map(([name, routes]) => ({ name, routes }))
})

function isActiveRoute(path: string) {
  const fullPath = `/${path}`
  return route.path === fullPath || route.path.startsWith(`${fullPath}/`)
}

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
  VideoCamera: markRaw(VideoCamera),
}

function getIcon(name: unknown): Component {
  return typeof name === 'string' && iconMap[name] ? iconMap[name] : Monitor
}
</script>

<style lang="scss" scoped>
.sidebar-inner {
  position: relative;
  z-index: 1;
  height: 100vh;
  display: flex;
  flex-direction: column;

  &__logo {
    height: 64px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 20px;
    cursor: pointer;
    border-bottom: 1px solid $border-subtle;
    flex-shrink: 0;

    &-mark {
      width: 32px;
      height: 32px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      background: rgba(99, 102, 241, 0.12);
      box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2);
    }

    &-subtitle {
      color: $text-tertiary;
      font-family: $font-mono;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
  }

  &__brand {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  &__logo {
    &-text {
      font-family: $font-sans;
      font-size: 15px;
      font-weight: 600;
      color: $text-primary;
      white-space: nowrap;
      letter-spacing: -0.01em;
    }
  }

  &__menu {
    overflow-y: auto;
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    flex: 1;
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__section-label {
    padding: 0 12px 6px;
    color: $text-tertiary;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: $radius-sm;
    color: $text-secondary;
    text-decoration: none;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.15s $ease-out;
    white-space: nowrap;
    position: relative;

    &:hover {
      background: rgba(255, 255, 255, 0.04);
      color: $text-primary;
    }

    &--active {
      background: rgba(99, 102, 241, 0.1);
      color: $accent-300;
      font-weight: 600;

      // 左侧 2px 竖条
      &::before {
        content: '';
        position: absolute;
        left: -8px;
        top: 50%;
        transform: translateY(-50%);
        width: 3px;
        height: 18px;
        background: $accent-500;
        border-radius: 0 2px 2px 0;
      }

      .sidebar-inner__item-icon {
        color: $accent-400;
      }
    }

    &-icon {
      font-size: 18px;
      width: 20px;
      text-align: center;
      flex-shrink: 0;
      transition: color 0.15s $ease-out;
    }

    &-label {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  &__bottom {
    padding: 12px 16px 16px;
    border-top: 1px solid $border-subtle;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-shrink: 0;
  }

  &__status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: $radius-full;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.16);

    &--ok {
      background: rgba(16, 185, 129, 0.08);
      border-color: rgba(16, 185, 129, 0.16);
    }

    &-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: $color-danger;
    }

    &--ok &-dot {
      background: $color-success;
    }

    &-text {
      font-size: 11px;
      color: $text-secondary;
      font-family: $font-mono;
      font-weight: 500;
    }

    &-retry {
      color: $text-tertiary;
      cursor: pointer;
      transition: color 0.15s $ease-out;

      &:hover {
        color: $accent-400;
      }
    }
  }

  &__toggle {
    width: 28px;
    height: 28px;
    border-radius: $radius-sm;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: $text-tertiary;
    transition: all 0.15s $ease-out;
    flex-shrink: 0;

    &:hover {
      background: rgba(255, 255, 255, 0.04);
      color: $text-primary;
    }
  }
}
</style>
