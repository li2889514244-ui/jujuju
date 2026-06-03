<template>
  <!-- Logo -->
  <div
    class="sidebar-inner__logo"
    @click="
      $router.push('/dashboard')
      $emit('navigate')
    "
  >
    <div class="sidebar-inner__logo-mark">
      <svg viewBox="0 0 28 28" fill="none" width="20" height="20">
        <rect width="28" height="28" rx="5" fill="#00cc99" />
        <path d="M9 20V8l10 6-10 6z" fill="#0b0e13" opacity="0.92" />
      </svg>
    </div>
    <span v-if="!collapsed" class="sidebar-inner__logo-text">披星云</span>
  </div>

  <!-- Menu -->
  <nav class="sidebar-inner__menu">
    <router-link
      v-for="r in menuRoutes"
      :key="r.path"
      :to="'/' + r.path"
      class="sidebar-inner__item"
      :class="{ 'sidebar-inner__item--active': activeMenu === '/' + r.path }"
      @click="$emit('navigate')"
    >
      <el-icon :size="18" class="sidebar-inner__item-icon">
        <component :is="getIcon(r.meta?.icon)" />
      </el-icon>
      <span v-if="!collapsed" class="sidebar-inner__item-label">{{ r.meta?.title }}</span>
    </router-link>
  </nav>

  <!-- Bottom -->
  <div class="sidebar-inner__bottom">
    <div class="sidebar-inner__status" :class="{ 'sidebar-inner__status--ok': backendOk }">
      <span class="sidebar-inner__status-dot"></span>
      <span v-if="!collapsed" class="sidebar-inner__status-text">{{ backendVersion }}</span>
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
} from '@element-plus/icons-vue'

defineProps<{ collapsed: boolean }>()
defineEmits<{ navigate: []; toggle: [] }>()

const route = useRoute()
const router = useRouter()
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
  } catch {
    backendVersion.value = '离线'
    backendOk.value = false
  }
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
    height: 48px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    cursor: pointer;
    border-bottom: 1px solid $color-border;
    &-mark {
      width: 26px;
      height: 26px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    &-text {
      font-family: $font-heading;
      font-size: 17px;
      font-weight: 700;
      color: $color-text-primary;
      white-space: nowrap;
      letter-spacing: 0.01em;
    }
  }

  &__menu {
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: $radius-md;
    color: $color-text-secondary;
    text-decoration: none;
    font-size: 13px;
    font-weight: 450;
    transition: all 0.15s $ease-out;
    white-space: nowrap;

    &:hover {
      background: rgba(0, 204, 153, 0.06);
      color: $color-text-primary;
    }
    &--active {
      background: rgba(0, 204, 153, 0.08);
      color: $color-accent;
      font-weight: 600;
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
    padding: 10px 8px;
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
    padding: 4px 10px;
    border-radius: $radius-full;
    background: rgba(239, 68, 68, 0.08);
    &--ok {
      background: rgba(34, 197, 94, 0.08);
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
      color: $color-text-tertiary;
      font-family: $font-mono;
    }
  }

  &__toggle {
    width: 30px;
    height: 30px;
    border-radius: $radius-sm;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: $color-text-tertiary;
    transition: all 0.15s;
    flex-shrink: 0;
    &:hover {
      background: rgba(0, 204, 153, 0.06);
      color: $color-text-primary;
    }
  }
}
</style>
