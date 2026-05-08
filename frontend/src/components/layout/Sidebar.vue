<template>
  <div class="sidebar" :class="{ 'sidebar--collapsed': isCollapsed }">
    <div class="sidebar__logo">
      <img src="@/assets/logo.svg" alt="MatrixFlow" class="sidebar__logo-img" />
      <span v-if="!isCollapsed" class="sidebar__logo-text">MatrixFlow</span>
    </div>

    <el-menu
      :default-active="activeMenu"
      :collapse="isCollapsed"
      :collapse-transition="false"
      router
      class="sidebar__menu"
    >
      <template v-for="route in menuRoutes" :key="route.path">
        <el-menu-item :index="'/' + route.path">
          <el-icon>
            <component :is="route.meta?.icon || 'Document'" />
          </el-icon>
          <template #title>{{ route.meta?.title }}</template>
        </el-menu-item>
      </template>
    </el-menu>

    <div class="sidebar__toggle" @click="toggleCollapse" role="button" :aria-label="isCollapsed ? '展开侧边栏' : '收起侧边栏'" tabindex="0" @keyup.enter="toggleCollapse">
      <el-icon>
        <Fold v-if="!isCollapsed" />
        <Expand v-else />
      </el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Fold, Expand } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const isCollapsed = ref(false)

const activeMenu = computed(() => route.path)

const menuRoutes = computed(() => {
  const mainRoute = router.options.routes.find((r) => r.path === '/')
  return (mainRoute?.children || []).filter((r) => !r.meta?.hidden)
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<style lang="scss" scoped>
.sidebar {
  width: $sidebar-width;
  height: 100vh;
  background: #001529;
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
  flex-shrink: 0;

  &--collapsed {
    width: $sidebar-collapsed-width;
  }

  &__logo {
    height: $topbar-height;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 16px;
    gap: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);

    &-img {
      width: 32px;
      height: 32px;
      flex-shrink: 0;
    }

    &-text {
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      white-space: nowrap;
      letter-spacing: 1px;
    }
  }

  &__menu {
    flex: 1;
    overflow-y: auto;
    border-right: none;
    background: transparent;

    :deep(.el-menu-item) {
      color: rgba(255, 255, 255, 0.65);

      &:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.08);
      }

      &.is-active {
        color: #fff;
        background: $primary-color;
      }
    }
  }

  &__toggle {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.45);
    cursor: pointer;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    transition: color 0.2s;

    &:hover {
      color: #fff;
    }
  }
}
</style>
