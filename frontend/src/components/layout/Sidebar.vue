<template>
  <!-- Mobile hamburger -->
  <div v-if="isMobile" class="sidebar__hamburger" @click="drawerVisible = true">
    <el-icon :size="22"><Expand /></el-icon>
  </div>

  <!-- Mobile drawer -->
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
      <SidebarInner :collapsed="false" @navigate="drawerVisible = false" />
    </div>
  </el-drawer>

  <!-- Desktop sidebar -->
  <div v-if="!isMobile" class="sidebar" :class="{ 'sidebar--collapsed': isCollapsed }">
    <SidebarInner :collapsed="isCollapsed" @toggle="toggleCollapse" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import SidebarInner from './SidebarInner.vue'

const isCollapsed = ref(false)
const drawerVisible = ref(false)
const isMobile = ref(false)

function checkViewport() {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) {
    isCollapsed.value = window.innerWidth < 1200
  }
}

function toggleCollapse() {
  if (window.innerWidth >= 1200) {
    isCollapsed.value = !isCollapsed.value
  }
}

onMounted(() => {
  checkViewport()
  window.addEventListener('resize', checkViewport)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkViewport)
})
</script>

<style lang="scss" scoped>
@import '@/assets/styles/variables';

.sidebar__hamburger {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 1001;
  width: 42px;
  height: 42px;
  border-radius: $radius-md;
  background: rgba(8, 11, 8, 0.9);
  border: 1px solid $color-border;
  box-shadow: $shadow-md;
  backdrop-filter: blur(18px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: $color-accent;
  transition: all 0.2s;
  &:hover {
    background: $color-bg-hover;
  }
}

.sidebar {
  width: $sidebar-width;
  height: 100vh;
  background:
    linear-gradient(180deg, rgba(199, 255, 69, 0.08), transparent 22%), rgba(5, 7, 5, 0.86);
  border-right: 1px solid rgba(199, 255, 69, 0.12);
  box-shadow: 20px 0 70px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(26px);
  display: flex;
  flex-direction: column;
  transition: width 0.25s $ease-out;
  flex-shrink: 0;
  z-index: 10;
  user-select: none;

  &--collapsed {
    width: $sidebar-collapsed-width;
  }
  &--drawer {
    background: $color-bg-primary;
    border-right: none;
  }
}
</style>

<style lang="scss">
.sidebar-drawer {
  background: $color-bg-primary !important;
  .el-drawer__body {
    padding: 0;
    height: 100%;
    overflow: hidden;
  }
}
</style>
