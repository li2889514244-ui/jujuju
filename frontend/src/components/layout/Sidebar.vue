<template>
  <!-- Mobile hamburger -->
  <div v-if="isMobile" class="sidebar__hamburger" @click="drawerVisible = true">
    <el-icon :size="20"><Expand /></el-icon>
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
.sidebar__hamburger {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 1001;
  width: 40px;
  height: 40px;
  border-radius: $radius-md;
  background: $bg-elevated;
  border: 1px solid $border-base;
  box-shadow: $shadow-md;
  backdrop-filter: blur(18px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: $text-secondary;
  transition: all 0.2s $ease-out;

  &:hover {
    color: $accent-400;
    border-color: $border-strong;
  }
}

.sidebar {
  width: $sidebar-width;
  height: 100vh;
  background-color: $bg-base;
  border-right: 1px solid $border-subtle;
  display: flex;
  flex-direction: column;
  transition: width 0.25s $ease-out;
  flex-shrink: 0;
  z-index: 10;
  user-select: none;
  position: relative;

  // 顶部极轻 indigo glow（不抢戏）
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 240px;
    background: radial-gradient(
      ellipse 100% 80% at 50% 0%,
      rgba(99, 102, 241, 0.06),
      transparent 70%
    );
    pointer-events: none;
  }

  &--collapsed {
    width: $sidebar-collapsed-width;
  }
  &--drawer {
    background: $bg-base;
    border-right: none;
  }
}
</style>

<style lang="scss">
.sidebar-drawer {
  background: $bg-base !important;
  .el-drawer__body {
    padding: 0;
    height: 100%;
    overflow: hidden;
  }
}
</style>
