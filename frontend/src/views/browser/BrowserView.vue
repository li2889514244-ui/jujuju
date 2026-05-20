<template>
  <div class="browser">
    <el-card shadow="hover">
      <template #header>
        <div class="browser__header">
          <span>浏览器管理</span>
        </div>
      </template>
      <el-empty description="浏览器引擎功能已禁用">
        <template #image>
          <el-icon :size="64" color="#48484a"><Monitor /></el-icon>
        </template>
        <p style="color: #6e6e73; font-size: 14px">
          浏览器引擎（browser-engine）已从系统中移除。<br />
          如需此功能，请联系管理员。
        </p>
      </el-empty>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { Monitor } from '@element-plus/icons-vue'
</script>

<style lang="scss" scoped>
.browser {
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}
</style>
