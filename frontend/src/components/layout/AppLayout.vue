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
      <GlobalLoadingOverlay />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import Sidebar from './Sidebar.vue'
import Topbar from './Topbar.vue'
import GlobalLoadingOverlay from '@/components/common/GlobalLoadingOverlay.vue'
import { useLoadingStore } from '@/store/loading'
import { useUserStore } from '@/store/user'
import { organizationSettingsApi } from '@/api/organization-settings'

const loadingStore = useLoadingStore()
const userStore = useUserStore()

onMounted(async () => {
  // 应用启动时加载一次组织级刷新动画配置（若已有则跳过）
  if (!loadingStore.configLoaded) {
    try {
      const res = await organizationSettingsApi.getLoadingImage()
      if (res.data) loadingStore.setLoadingConfig(res.data)
    } catch {
      // 配置加载失败时使用默认 Logo，不打扰用户
    } finally {
      loadingStore.setConfigLoaded(true)
    }
  }
  // 启动时同步一次最新用户信息：角色可能刚被管理员修改，本地持久化的角色可能已过期
  try {
    await userStore.fetchUserInfo()
  } catch {
    // 刷新失败沿用本地缓存的用户信息，不打扰用户
  }
})

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
