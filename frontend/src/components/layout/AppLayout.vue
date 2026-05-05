<template>
  <div class="app-layout">
    <Sidebar />
    <div class="app-layout__main">
      <Topbar />
      <div class="app-layout__content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'
</script>

<style lang="scss" scoped>
.app-layout {
  display: flex;
  width: 100%;
  height: 100vh;
  overflow: hidden;

  &__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__content {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    background-color: #f5f7fa;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
