<template>
  <div class="login">
    <div class="login__container">
      <div class="login__header">
        <h1 class="login__title">披星云</h1>
        <p class="login__subtitle">矩阵账号管理平台</p>
      </div>

      <div class="login__switch">
        <button :class="{ active: activeTab === 'login' }" @click="activeTab = 'login'">登录</button>
        <button :class="{ active: activeTab === 'register' }" @click="activeTab = 'register'">注册</button>
      </div>

      <div v-show="activeTab === 'login'">
        <el-form
          ref="loginFormRef"
          :model="loginForm"
          :rules="loginRules"
          label-width="0"
          size="large"
          @submit.prevent="handleLogin"
        >
          <el-form-item prop="email">
            <el-input v-model="loginForm.email" placeholder="邮箱" :prefix-icon="Message" />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="loginForm.password"
              type="password"
              placeholder="密码"
              :prefix-icon="Lock"
              show-password
              @keyup.enter="handleLogin"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" class="login__btn" @click="handleLogin">
              登录
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <div v-show="activeTab === 'register'">
        <el-form
          ref="registerFormRef"
          :model="registerForm"
          :rules="registerRules"
          label-width="0"
          size="large"
          @submit.prevent="handleRegister"
        >
          <el-form-item prop="name">
            <el-input v-model="registerForm.name" placeholder="用户名 / 昵称" :prefix-icon="User" />
          </el-form-item>
          <el-form-item prop="email">
            <el-input v-model="registerForm.email" placeholder="邮箱" :prefix-icon="Message" />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="registerForm.password"
              type="password"
              placeholder="密码"
              :prefix-icon="Lock"
              show-password
            />
          </el-form-item>
          <el-form-item prop="confirmPassword">
            <el-input
              v-model="registerForm.confirmPassword"
              type="password"
              placeholder="确认密码"
              :prefix-icon="Lock"
              show-password
              @keyup.enter="handleRegister"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" class="login__btn" @click="handleRegister">
              注册
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { User, Lock, Message } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import { authApi } from '@/api/auth'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const activeTab = ref('login')
const loading = ref(false)
const loginFormRef = ref<FormInstance>()
const registerFormRef = ref<FormInstance>()

const loginForm = reactive({ email: '', password: '' })
const registerForm = reactive({
  name: '', email: '', password: '', confirmPassword: '',
})

const loginRules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, message: '密码至少8位', trigger: 'blur' },
  ],
}

const validateConfirmPassword = (
  _rule: unknown, value: string, callback: (error?: Error) => void,
) => {
  if (value !== registerForm.password) { callback(new Error('两次密码不一致')) }
  else { callback() }
}

const registerRules: FormRules = {
  name: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 1, max: 20, message: '用户名1-20个字符', trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, message: '密码至少8位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' },
  ],
}

async function handleLogin() {
  const valid = await loginFormRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    await userStore.login(loginForm)
    ElMessage.success('登录成功')
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.push(redirect)
  } catch { /* 错误已由拦截器处理 */ }
  finally { loading.value = false }
}

async function handleRegister() {
  const valid = await registerFormRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  try {
    const { confirmPassword: _, ...registerData } = registerForm
    await authApi.register(registerData)
    ElMessage.success('注册成功，请登录')
    activeTab.value = 'login'
    loginForm.email = registerForm.email
  } catch { /* 错误已由拦截器处理 */ }
  finally { loading.value = false }
}
</script>

<style lang="scss" scoped>
.login {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-bg-primary;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 60% 30% at 50% 0%, rgba(212, 155, 80, 0.05) 0%, transparent 60%),
      radial-gradient(ellipse 30% 40% at 80% 100%, rgba(200, 133, 64, 0.03) 0%, transparent 50%);
    pointer-events: none;
  }

  &__container {
    width: 400px;
    padding: $space-2xl;
    position: relative;
    z-index: 1;
    background: rgba(32, 29, 27, 0.8);
    backdrop-filter: blur(40px) saturate(120%);
    -webkit-backdrop-filter: blur(40px) saturate(120%);
    border: 1px solid $color-border;
    border-radius: $radius-xl;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  &__header {
    text-align: center;
    margin-bottom: 32px;
  }

  &__title {
    font-family: $font-display;
    font-size: 28px;
    font-weight: 600;
    color: $color-cream;
    margin-bottom: 6px;
    letter-spacing: 0.02em;
  }

  &__subtitle {
    color: $color-text-tertiary;
    font-size: $text-body;
    font-weight: 400;
  }

  &__switch {
    display: flex;
    gap: 0;
    margin-bottom: 24px;
    background: $color-bg-tertiary;
    border-radius: $radius-md;
    padding: 3px;
    button {
      flex: 1;
      padding: 8px 0;
      border: none;
      border-radius: $radius-sm;
      background: transparent;
      color: $color-text-tertiary;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      &.active {
        background: $color-bg-elevated;
        color: $color-text-primary;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
    }
  }

  &__btn {
    width: 100%;
    height: 44px;
    font-size: 16px;
    font-weight: 500;
    letter-spacing: -0.01em;
    margin-top: 4px;
  }
}
</style>
