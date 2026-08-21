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
import { ref, onMounted, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { User, Upload, Check, InfoFilled } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import { authApi } from '@/api/auth'
import type { UserInfo } from '@/types'

const userStore = useUserStore()
const loading = ref(false)
const saving = ref(false)
const userInfo = ref<UserInfo | null>(null)

const form = reactive({
  name: '',
  email: '',
  phone: '',
  avatar: '',
})

onMounted(() => {
  loadUserInfo()
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
