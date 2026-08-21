<template>
  <div class="password-settings">
    <div class="password-settings__header">
      <div>
        <h2>修改密码</h2>
        <p>定期更换密码可以保护您的账户安全</p>
      </div>
    </div>

    <section class="settings-panel">
      <div class="settings-panel__main">
        <div class="section-title">
          <el-icon><Lock /></el-icon>
          <span>密码修改</span>
        </div>

        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="密码要求"
          description="密码长度至少8位，必须包含大写字母、小写字母和数字"
          class="password-hint"
        />

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          class="settings-form"
          @submit.prevent
        >
          <el-form-item label="当前密码" prop="oldPassword">
            <el-input
              v-model="form.oldPassword"
              type="password"
              placeholder="请输入当前密码"
              show-password
            />
          </el-form-item>

          <el-form-item label="新密码" prop="newPassword">
            <el-input
              v-model="form.newPassword"
              type="password"
              placeholder="请输入新密码"
              show-password
            />
          </el-form-item>

          <el-form-item label="确认新密码" prop="confirmPassword">
            <el-input
              v-model="form.confirmPassword"
              type="password"
              placeholder="请再次输入新密码"
              show-password
            />
          </el-form-item>

          <div class="form-actions">
            <el-button type="primary" :loading="saving" @click="handleSubmit">
              <el-icon><Check /></el-icon>
              确认修改
            </el-button>
            <el-button @click="handleReset">重置</el-button>
          </div>
        </el-form>
      </div>

      <aside class="tips-panel">
        <div class="section-title">
          <el-icon><WarningFilled /></el-icon>
          <span>安全提示</span>
        </div>

        <div class="tips-list">
          <div class="tip-item">
            <strong>使用强密码</strong>
            <p>避免使用生日、手机号等容易被猜到的密码</p>
          </div>
          <div class="tip-item">
            <strong>定期更换</strong>
            <p>建议每3个月更换一次密码</p>
          </div>
          <div class="tip-item">
            <strong>不要重复使用</strong>
            <p>不要在多个网站使用相同的密码</p>
          </div>
          <div class="tip-item">
            <strong>修改后重新登录</strong>
            <p>密码修改成功后，您需要重新登录</p>
          </div>
        </div>
      </aside>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Lock, Check, WarningFilled } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import { authApi } from '@/api/auth'

const userStore = useUserStore()
const formRef = ref<FormInstance>()
const saving = ref(false)

const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const validateConfirmPassword = (_rule: unknown, value: string, callback: (error?: Error) => void) => {
  if (value !== form.newPassword) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const rules: FormRules = {
  oldPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' },
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '密码长度不能少于8位', trigger: 'blur' },
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (!/[A-Z]/.test(value)) {
          callback(new Error('密码必须包含至少一个大写字母'))
        } else if (!/[a-z]/.test(value)) {
          callback(new Error('密码必须包含至少一个小写字母'))
        } else if (!/[0-9]/.test(value)) {
          callback(new Error('密码必须包含至少一个数字'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' },
  ],
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    await authApi.changePassword({
      oldPassword: form.oldPassword,
      newPassword: form.newPassword,
    })
    ElMessage.success('密码修改成功，请重新登录')
    setTimeout(() => {
      userStore.logout()
    }, 1500)
  } catch (error: any) {
    ElMessage.error(error?.message || '密码修改失败')
  } finally {
    saving.value = false
  }
}

function handleReset() {
  form.oldPassword = ''
  form.newPassword = ''
  form.confirmPassword = ''
  formRef.value?.resetFields()
}
</script>

<style lang="scss" scoped>
.password-settings {
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

.password-hint {
  margin-bottom: 18px;
}

.settings-form {
  :deep(.el-form-item__label) {
    color: $text-secondary;
    font-weight: 600;
  }
}

.form-actions {
  display: flex;
  gap: 10px;
  padding-top: 4px;
}

.tips-panel {
  border-left: 1px solid $border-subtle;
  padding-left: 24px;
  color: $text-secondary;
}

.tips-list {
  display: grid;
  gap: 14px;
}

.tip-item {
  strong {
    display: block;
    color: $text-primary;
    font-size: 13px;
  }

  p {
    margin: 5px 0 0;
    color: $text-secondary;
    font-size: 12px;
    line-height: 1.6;
  }
}

@media (max-width: 860px) {
  .password-settings {
    padding: 18px;
  }

  .settings-panel {
    grid-template-columns: 1fr;
  }

  .tips-panel {
    border-left: 0;
    border-top: 1px solid $border-subtle;
    padding: 20px 0 0;
  }
}
</style>
