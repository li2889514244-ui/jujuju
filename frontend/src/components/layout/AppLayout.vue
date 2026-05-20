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
      htmlEl.style.transitionDelay = `${i * 50}ms`
      htmlEl.classList.add('stagger-visible')
      setTimeout(
        () => {
          htmlEl.style.transitionDelay = '0ms'
        },
        600 + i * 50,
      )
    })
  })
}
</script>

<style lang="scss" scoped>
@import '@/assets/styles/variables';

.app-layout {
  display: flex;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: var(--app-bg-primary);

  &__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    z-index: 1;
  }

  &__content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: $space-2xl $space-3xl;
    max-width: var(--content-max-width, 1200px);
    margin: 0 auto;
    width: 100%;
    &::-webkit-scrollbar {
      width: 4px;
    }
  }
}
</style>
