<template>
  <!-- Logo -->
  <div class="sidebar-inner__logo" @click="onLogoClick">
    <div class="sidebar-inner__logo-mark">
      <svg viewBox="0 0 28 28" fill="none" width="20" height="20">
        <rect width="28" height="28" rx="8" fill="#c7ff45" />
        <path d="M9 20V8l10 6-10 6z" fill="#071008" opacity="0.96" />
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
    <div
      v-if="!collapsed"
      class="sidebar-inner__toggle"
      :title="'收起菜单'"
      @click="$emit('toggle')"
    >
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
@import '@/assets/styles/variables';

.sidebar-inner {
  &__logo {
    height: 78px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 18px;
    cursor: pointer;
    border-bottom: 1px solid rgba(199, 255, 69, 0.11);
    position: relative;

    &::after {
      content: '';
      position: absolute;
      right: 18px;
      bottom: -1px;
      left: 18px;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba($color-accent, 0.65), transparent);
    }

    &-mark {
      width: 36px;
      height: 36px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      background: rgba($color-accent, 0.08);
      box-shadow:
        0 0 24px rgba($color-accent, 0.18),
        inset 0 0 0 1px rgba($color-accent, 0.12);
    }

    &-subtitle {
      color: $color-text-tertiary;
      font-family: $font-mono;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
  }

  &__brand {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__logo {
    &-text {
      font-family: $font-heading;
      font-size: 18px;
      font-weight: 860;
      color: $color-text-primary;
      white-space: nowrap;
      letter-spacing: -0.03em;
    }
  }

  &__menu {
    overflow-y: auto;
    padding: 18px 12px;
    display: flex;
    flex-direction: column;
    gap: 18px;
    flex: 1;
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__section-label {
    padding: 0 10px 2px;
    color: rgba($color-accent, 0.62);
    font-size: 10px;
    font-weight: 860;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 12px;
    border-radius: $radius-md;
    color: $color-text-secondary;
    text-decoration: none;
    font-size: 14px;
    font-weight: 720;
    transition: all 0.18s $ease-out;
    white-space: nowrap;
    border: 1px solid transparent;
    position: relative;
    overflow: hidden;

    &:hover {
      background: rgba($color-accent, 0.07);
      border-color: rgba($color-accent, 0.13);
      color: $color-text-primary;
    }

    &--active {
      background:
        linear-gradient(90deg, rgba($color-accent, 0.18), rgba($color-accent-alt, 0.05)),
        rgba(199, 255, 69, 0.045);
      border-color: rgba($color-accent, 0.3);
      color: $color-accent;
      box-shadow:
        inset 3px 0 0 $color-accent,
        0 0 22px rgba($color-accent, 0.08);
      font-weight: 840;

      &::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          115deg,
          transparent 0%,
          rgba(255, 255, 255, 0.08) 45%,
          transparent 70%
        );
        transform: translateX(-55%);
      }

      .sidebar-inner__item-icon {
        color: $color-accent;
      }
    }
    &-icon {
      font-size: 18px;
      width: 24px;
      text-align: center;
      flex-shrink: 0;
    }
    &-label {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  &__bottom {
    padding: 14px 12px 16px;
    border-top: 1px solid rgba(199, 255, 69, 0.11);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }

  &__status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 11px;
    border-radius: $radius-full;
    background: rgba($color-danger, 0.08);
    border: 1px solid rgba($color-danger, 0.16);

    &--ok {
      background: rgba($color-success, 0.08);
      border-color: rgba($color-success, 0.16);
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
      font-size: $text-micro;
      color: $color-text-secondary;
      font-family: $font-mono;
    }
    &-retry {
      color: $color-text-tertiary;
      cursor: pointer;
      transition: color 0.15s;
      &:hover {
        color: $color-accent;
      }
    }
  }

  &__toggle {
    width: 34px;
    height: 34px;
    border-radius: $radius-sm;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: $color-text-tertiary;
    transition: all 0.15s;
    flex-shrink: 0;
    &:hover {
      background: rgba($color-accent, 0.08);
      color: $color-text-primary;
    }
  }
}
</style>
