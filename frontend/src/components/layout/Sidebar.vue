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
  top: 8px;
  left: 8px;
  z-index: 1001;
  width: 36px;
  height: 36px;
  border-radius: $radius-md;
  background: $color-bg-elevated;
  border: 1px solid $color-border;
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
  background: $color-bg-secondary;
  border-right: 1px solid $color-border;
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
    background: $color-bg-secondary;
    border-right: none;
  }
}
</style>

<style lang="scss">
.sidebar-drawer {
  background: $color-bg-secondary !important;
  .el-drawer__body {
    padding: 0;
    height: 100%;
    overflow: hidden;
  }
}
</style>
