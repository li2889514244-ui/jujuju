<template>
  <div class="browser-publish">
    <el-page-header @back="$router.back()" title="返回" class="browser-publish__header">
      <template #content>
        <span>浏览器发布监控</span>
      </template>
    </el-page-header>

    <el-card shadow="hover">
      <el-empty description="浏览器引擎功能已禁用">
        <template #image>
          <el-icon :size="64" color="#c0c4cc"><Monitor /></el-icon>
        </template>
        <p style="color: #909399; font-size: 14px;">
          浏览器引擎（browser-engine）已从系统中移除，浏览器发布功能不可用。<br />
          如需此功能，请联系管理员。
        </p>
        <el-button @click="$router.back()">返回</el-button>
      </el-empty>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { Monitor } from '@element-plus/icons-vue'
</script>

<style lang="scss" scoped>
.browser-publish {
  &__header {
    margin-bottom: 20px;
  }
}
</style>
