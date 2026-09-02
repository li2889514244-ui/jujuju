<template>
  <div class="profile-settings">
    <div class="profile-settings__header">
      <div>
        <h2>个人设置</h2>
        <p>管理您的个人资料和账户信息</p>
      </div>
    </div>

    <el-skeleton v-if="loading && !userInfo" :rows="8" animated />

    <template v-else>
      <section class="settings-panel loading-image-panel">
        <div class="settings-panel__main">
          <div class="section-title">
            <el-icon><Picture /></el-icon>
            <span>刷新动画图片</span>
          </div>
          <p class="form-hint loading-image-panel__hint">
            上传多张图片组成图片库，全站数据刷新时随机选择一张作为圆形旋转动画；支持 PNG / JPG /
            JPEG / WEBP（单张 ≤3MB）。未上传时使用披星云默认 Logo。
          </p>

          <div class="loading-image-toolbar">
            <input
              ref="fileInputRef"
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              multiple
              class="loading-image-input"
              @change="onFileChange"
            />
            <el-button type="primary" plain size="small" :loading="uploading" @click="chooseFile">
              <el-icon><Upload /></el-icon>上传图片
            </el-button>
            <el-button size="small" :disabled="!config.images.length" @click="resetImages">
              <el-icon><Delete /></el-icon>清空全部
            </el-button>
            <div class="loading-image-switch">
              <span>随机播放</span>
              <el-switch
                :model-value="config.randomEnabled"
                :disabled="!config.images.length"
                @change="toggleRandom"
              />
            </div>
          </div>

          <div v-if="config.images.length" class="loading-image-gallery">
            <div
              v-for="item in config.images"
              :key="item.fileName"
              class="loading-image-cell"
              :class="{ 'loading-image-cell--default': !config.randomEnabled && item.url === config.defaultImageUrl }"
              :title="!config.randomEnabled ? '点击设为默认刷新图' : ''"
              @click="!config.randomEnabled && setDefaultImage(item)"
            >
              <el-image
                :src="item.url"
                :preview-src-list="config.images.map((i) => i.url)"
                :initial-index="config.images.indexOf(item)"
                preview-teleported
                fit="cover"
                class="loading-image-thumb"
              >
                <template #error>
                  <div class="loading-image-thumb-error">加载失败</div>
                </template>
              </el-image>
              <span v-if="!config.randomEnabled && item.url === config.defaultImageUrl" class="loading-image-badge">
                默认
              </span>
              <el-button
                class="loading-image-delete"
                circle
                size="small"
                :icon="Close"
                title="删除"
                @click.stop="removeImage(item)"
              />
            </div>
          </div>
          <div v-else class="loading-image-empty">
            <span>当前图片库为空，刷新时使用披星云默认 Logo</span>
          </div>

          <div class="form-hint">{{ statusText }}</div>
        </div>
      </section>

      <section class="settings-panel">
        <div class="settings-panel__main">
          <div class="section-title">
            <el-icon><User /></el-icon>
            <span>基本信息</span>
          </div>

          <el-form label-position="top" class="settings-form" @submit.prevent>
            <el-form-item label="头像">
              <div class="avatar-upload">
                <el-avatar :size="80" :src="form.avatar">
                  {{ form.name?.charAt(0)?.toUpperCase() }}
                </el-avatar>
                <el-button type="primary" plain size="small" @click="handleAvatarUpload">
                  <el-icon><Upload /></el-icon>
                  更换头像
                </el-button>
              </div>
            </el-form-item>

            <el-form-item label="用户名">
              <el-input v-model="form.name" placeholder="请输入用户名" maxlength="20" show-word-limit />
            </el-form-item>

            <el-form-item label="邮箱">
              <el-input v-model="form.email" placeholder="请输入邮箱" disabled />
              <div class="form-hint">邮箱不可修改</div>
            </el-form-item>

            <el-form-item label="手机号">
              <el-input v-model="form.phone" placeholder="请输入手机号" maxlength="11" />
            </el-form-item>

            <div class="form-actions">
              <el-button type="primary" :loading="saving" @click="saveProfile">
                <el-icon><Check /></el-icon>
                保存修改
              </el-button>
            </div>
          </el-form>
        </div>

        <aside class="info-panel">
          <div class="section-title">
            <el-icon><InfoFilled /></el-icon>
            <span>账户信息</span>
          </div>

          <div class="info-list">
            <div class="info-item">
              <span>用户ID</span>
              <strong>{{ userInfo?.id }}</strong>
            </div>
            <div class="info-item">
              <span>角色</span>
              <el-tag :type="getRoleType(userInfo?.role)">{{ getRoleLabel(userInfo?.role) }}</el-tag>
            </div>
            <div class="info-item">
              <span>注册时间</span>
              <strong>{{ formatTime(userInfo?.createdAt) }}</strong>
            </div>
            <div class="info-item">
              <span>最后登录</span>
              <strong>{{ formatTime(userInfo?.lastLoginAt) }}</strong>
            </div>
          </div>
        </aside>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { User, Upload, Check, InfoFilled, Picture, Delete, Close } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import { useLoadingStore } from '@/store/loading'
import { authApi } from '@/api/auth'
import {
  organizationSettingsApi,
  type LoadingImageConfig,
  type LoadingImageItem,
} from '@/api/organization-settings'
import type { UserInfo } from '@/types'

const userStore = useUserStore()
const loadingStore = useLoadingStore()
const loading = ref(false)
const saving = ref(false)
const userInfo = ref<UserInfo | null>(null)

// ── 刷新动画图片库（组织级配置） ──
const config = reactive<LoadingImageConfig>({
  images: [],
  randomEnabled: true,
  defaultImageUrl: '',
  hasCustom: false,
})
const uploading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)
const statusText = computed(() => {
  if (!config.images.length) return '当前使用：披星云默认 Logo'
  if (config.randomEnabled) return `当前图片库：${config.images.length} 张 · 随机播放`
  return `当前图片库：${config.images.length} 张 · 固定显示默认图`
})

function syncStore(configData?: LoadingImageConfig | null) {
  if (configData) loadingStore.setLoadingConfig(configData)
}

async function loadLoadingImageConfig() {
  try {
    const res = await organizationSettingsApi.getLoadingImage()
    if (res.data) {
      config.images = res.data.images || []
      config.randomEnabled = res.data.randomEnabled !== false
      config.defaultImageUrl = res.data.defaultImageUrl || ''
      config.hasCustom = Boolean(res.data.hasCustom)
      syncStore(res.data)
    }
  } catch {
    /* 配置加载失败保持默认 */
  }
}

function chooseFile() {
  fileInputRef.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (files.length === 0) return
  const invalid = files.find(
    (file) => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type),
  )
  if (invalid) {
    ElMessage.error('仅支持 PNG / JPG / JPEG / WEBP 图片')
    return
  }
  const oversized = files.find((file) => file.size > 3 * 1024 * 1024)
  if (oversized) {
    ElMessage.error('单张图片不能超过 3MB')
    return
  }
  uploading.value = true
  try {
    const res = await organizationSettingsApi.uploadLoadingImages(files)
    if (res.data) {
      config.images = res.data.images || []
      config.randomEnabled = res.data.randomEnabled !== false
      config.defaultImageUrl = res.data.defaultImageUrl || ''
      config.hasCustom = Boolean(res.data.hasCustom)
      syncStore(res.data)
    }
    ElMessage.success(`已上传 ${files.length} 张图片`)
  } catch (error: any) {
    console.error('[刷新动画图片] 上传失败', error)
    ElMessage.error('图片上传失败，请稍后重试')
  } finally {
    uploading.value = false
  }
}

async function removeImage(item: LoadingImageItem) {
  try {
    await ElMessageBox.confirm('确定删除这张刷新图片吗？', '删除图片', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    const res = await organizationSettingsApi.deleteLoadingImage(item.fileName)
    if (res.data) {
      config.images = res.data.images || []
      config.randomEnabled = res.data.randomEnabled !== false
      config.defaultImageUrl = res.data.defaultImageUrl || ''
      config.hasCustom = Boolean(res.data.hasCustom)
      syncStore(res.data)
    }
    ElMessage.success('图片已删除')
  } catch (error: any) {
    console.error('[刷新动画图片] 删除失败', error)
    ElMessage.error('图片删除失败，请稍后重试')
  }
}

async function resetImages() {
  try {
    await ElMessageBox.confirm('确定清空整个图片库并恢复默认 Logo 吗？', '清空图片库', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  uploading.value = true
  try {
    const res = await organizationSettingsApi.resetLoadingImages()
    if (res.data) {
      config.images = res.data.images || []
      config.randomEnabled = res.data.randomEnabled !== false
      config.defaultImageUrl = res.data.defaultImageUrl || ''
      config.hasCustom = Boolean(res.data.hasCustom)
      syncStore(res.data)
    }
    ElMessage.success('已清空图片库，恢复默认 Logo')
  } catch (error: any) {
    console.error('[刷新动画图片] 清空失败', error)
    ElMessage.error('操作失败，请稍后重试')
  } finally {
    uploading.value = false
  }
}

async function toggleRandom(value: string | number | boolean) {
  const enabled = Boolean(value)
  try {
    const res = await organizationSettingsApi.updateLoadingPrefs({ randomEnabled: enabled })
    if (res.data) {
      config.randomEnabled = res.data.randomEnabled !== false
      config.defaultImageUrl = res.data.defaultImageUrl || ''
      syncStore(res.data)
    }
    ElMessage.success(enabled ? '已开启随机播放' : '已关闭随机播放，将固定显示默认图')
  } catch (error: any) {
    config.randomEnabled = !enabled
    console.error('[刷新动画图片] 设置失败', error)
    ElMessage.error('设置失败，请稍后重试')
  }
}

async function setDefaultImage(item: LoadingImageItem) {
  try {
    const res = await organizationSettingsApi.updateLoadingPrefs({
      defaultFileName: item.fileName,
    })
    if (res.data) {
      config.defaultImageUrl = res.data.defaultImageUrl || ''
      syncStore(res.data)
    }
    ElMessage.success('已设为默认刷新图')
  } catch (error: any) {
    console.error('[刷新动画图片] 设置默认失败', error)
    ElMessage.error('设置失败，请稍后重试')
  }
}

const form = reactive({
  name: '',
  email: '',
  phone: '',
  avatar: '',
})

onMounted(() => {
  loadUserInfo()
  loadLoadingImageConfig()
})

async function loadUserInfo() {
  loading.value = true
  try {
    const res = await authApi.getUserInfo()
    userInfo.value = res.data
    form.name = res.data.name || ''
    form.email = res.data.email || ''
    form.phone = res.data.phone || ''
    form.avatar = res.data.avatar || ''
  } catch (error) {
    ElMessage.error('加载用户信息失败')
  } finally {
    loading.value = false
  }
}

async function saveProfile() {
  if (!form.name.trim()) {
    ElMessage.warning('请输入用户名')
    return
  }

  saving.value = true
  try {
    const res = await authApi.updateProfile({
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      avatar: form.avatar || undefined,
    })
    userInfo.value = res.data
    userStore.userInfo = { ...userStore.userInfo, ...res.data }
    ElMessage.success('个人资料已更新')
  } catch (error) {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

function handleAvatarUpload() {
  ElMessage.info('头像上传功能开发中')
}

function getRoleType(role?: string) {
  switch (role) {
    case 'OWNER':
      return 'danger'
    case 'ADMIN':
      return 'warning'
    default:
      return 'info'
  }
}

function getRoleLabel(role?: string) {
  switch (role) {
    case 'OWNER':
      return '所有者'
    case 'ADMIN':
      return '管理员'
    case 'GROUP_LEADER':
      return '组长'
    default:
      return '成员'
  }
}

function formatTime(time?: string) {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}
</script>

<style lang="scss" scoped>
.profile-settings {
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px;
  color: $text-primary;

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;

    h2 {
      margin: 0;
      font-size: 24px;
      line-height: 1.2;
      font-weight: 700;
      letter-spacing: 0;
    }

    p {
      margin: 8px 0 0;
      color: $text-secondary;
      font-size: 14px;
    }
  }
}

.settings-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 24px;
  padding: 20px;
  border: 1px solid $border-subtle;
  background: $bg-elevated;
  border-radius: $radius-md;
  box-shadow: $shadow-sm;

  &__main {
    min-width: 0;
  }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  color: $text-primary;
  font-size: 14px;
  font-weight: 700;
}

.settings-form {
  :deep(.el-form-item__label) {
    color: $text-secondary;
    font-weight: 600;
  }
}

.avatar-upload {
  display: flex;
  align-items: center;
  gap: 16px;
}

.form-hint {
  margin-top: 6px;
  color: $text-tertiary;
  font-size: 12px;
}

.form-actions {
  display: flex;
  gap: 10px;
  padding-top: 4px;
}

.info-panel {
  border-left: 1px solid $border-subtle;
  padding-left: 24px;
  color: $text-secondary;
}

.info-list {
  display: grid;
  gap: 14px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: $radius-sm;

  span {
    color: $text-tertiary;
    font-size: 13px;
  }

  strong {
    color: $text-primary;
    font-size: 13px;
    font-weight: 500;
  }
}

// ── 刷新动画图片库 ──
.loading-image-panel {
  margin-bottom: 20px;

  &__hint {
    margin: -6px 0 16px;
  }
}

.loading-image-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.loading-image-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  color: $text-secondary;
  font-size: 13px;
}

.loading-image-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.loading-image-cell {
  position: relative;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  cursor: pointer;

  &--default {
    outline: 2px solid $accent-500;
    outline-offset: 3px;
  }

  &:hover .loading-image-delete {
    opacity: 1;
  }
}

.loading-image-thumb {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba($accent-400, 0.45);
  background: rgba($bg-hover, 0.5);

  :deep(.el-image__inner) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }
}

.loading-image-thumb-error {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: $text-tertiary;
  font-size: 11px;
}

.loading-image-badge {
  position: absolute;
  left: 50%;
  bottom: -18px;
  transform: translateX(-50%);
  padding: 1px 8px;
  border-radius: $radius-full;
  background: $accent-500;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  pointer-events: none;
}

.loading-image-delete {
  position: absolute;
  top: -6px;
  right: -6px;
  opacity: 0;
  transition: opacity var(--motion-fast) var(--ease-standard);
}

.loading-image-empty {
  padding: 14px 16px;
  border: 1px dashed $border-base;
  border-radius: $radius-md;
  color: $text-tertiary;
  font-size: 13px;
}

.loading-image-input {
  display: none;
}

@media (max-width: 860px) {
  .profile-settings {
    padding: 18px;
  }

  .settings-panel {
    grid-template-columns: 1fr;
  }

  .info-panel {
    border-left: 0;
    border-top: 1px solid $border-subtle;
    padding: 20px 0 0;
  }
}
</style>
