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
@import '@/assets/styles/variables';

.app-layout {
  display: flex;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at 78% 8%, rgba(199, 255, 69, 0.08), transparent 26%),
    radial-gradient(circle at 30% 100%, rgba(32, 224, 163, 0.08), transparent 30%),
    $color-bg-primary;
  isolation: isolate;
  position: relative;

  &::before {
    content: '';
    position: absolute;
    inset: 16px 16px 16px $sidebar-width;
    border: 1px solid rgba(243, 240, 223, 0.045);
    border-radius: 34px;
    pointer-events: none;
    z-index: 0;
  }

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
    padding: 34px 42px 48px;
    position: relative;
    z-index: 1;
  }
}

@media (max-width: 1199px) {
  .app-layout::before {
    left: $sidebar-collapsed-width;
  }
}

@media (max-width: 768px) {
  .app-layout::before {
    inset: 8px;
    border-radius: 24px;
  }
}
</style>
