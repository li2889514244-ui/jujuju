<template>
  <div class="app-layout">
    <Sidebar />
    <div class="app-layout__main">
      <Topbar />
      <main class="app-layout__content" aria-label="主内容区">
        <router-view v-slot="{ Component }">
          <transition name="slide-up" mode="out-in" @after-enter="onPageEnter">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'

function onPageEnter() {
  requestAnimationFrame(() => {
    document.querySelectorAll('.stagger-item').forEach((el, i) => {
      const htmlEl = el as HTMLElement
      htmlEl.style.transitionDelay = `${i * 40}ms`
      htmlEl.classList.add('stagger-visible')
      setTimeout(
        () => {
          htmlEl.style.transitionDelay = '0ms'
        },
        500 + i * 40,
      )
    })
  })
}
</script>

<style lang="scss" scoped>
.app-layout {
  display: flex;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background-color: $bg-deep;
  position: relative;

  &__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  &__content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    background-color: $bg-deep;
    position: relative;
  }
}
</style>
