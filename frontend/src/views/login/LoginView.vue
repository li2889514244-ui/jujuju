<template>
  <div class="login">
    <!-- 漂浮光斑（深空感） -->
    <div class="login__orb login__orb--1" aria-hidden="true"></div>
    <div class="login__orb login__orb--2" aria-hidden="true"></div>
    <div class="login__orb login__orb--3" aria-hidden="true"></div>

    <!-- 左侧品牌墙 -->
    <aside class="login__brand">
      <div class="login__brand-inner">
        <div class="login__logo">
          <div class="login__logo-mark">
            <svg viewBox="0 0 32 32" fill="none" width="28" height="28" aria-hidden="true">
              <defs>
                <linearGradient id="loginLogoGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stop-color="#a5b0ff" />
                  <stop offset="100%" stop-color="#6366f1" />
                </linearGradient>
              </defs>
              <rect width="32" height="32" rx="9" fill="url(#loginLogoGrad)" />
              <path d="M10 23V9l12 7-12 7z" fill="#ffffff" opacity="0.96" />
            </svg>
          </div>
          <div class="login__logo-text">
            <span class="login__brand-name">披星云</span>
            <span class="login__brand-tag">Matrix Operating Suite</span>
          </div>
        </div>

        <h1 class="login__hero">一站式矩阵账号<br />管理 · 内容 · 数据</h1>
        <p class="login__hero-sub">
          多平台账号统一接入，AI 驱动的内容调度与数据洞察，让短视频运营更高效。
        </p>

        <ul class="login__features">
          <li>
            <span class="login__feature-icon"
              ><el-icon :size="14"><Connection /></el-icon
            ></span>
            <div>
              <strong>多平台统一接入</strong>
              <p>抖音、快手、小红书、视频号 等主流平台账号矩阵化管理</p>
            </div>
          </li>
          <li>
            <span class="login__feature-icon"
              ><el-icon :size="14"><Calendar /></el-icon
            ></span>
            <div>
              <strong>内容发布与日历</strong>
              <p>智能排期、跨平台分发、状态追踪一目了然</p>
            </div>
          </li>
          <li>
            <span class="login__feature-icon"
              ><el-icon :size="14"><TrendCharts /></el-icon
            ></span>
            <div>
              <strong>数据中台与洞察</strong>
              <p>账号、内容、商业全维度可视化，决策有依据</p>
            </div>
          </li>
        </ul>

        <p class="login__footer-note">© {{ currentYear }} MatrixFlow · 以简驭繁</p>
      </div>
    </aside>

    <!-- 右侧表单区 -->
    <main class="login__form-area">
      <div class="login__card">
        <div class="login__card-header">
          <h2>{{ activeTab === 'login' ? '欢迎回来' : '创建账号' }}</h2>
          <p>{{ activeTab === 'login' ? '请使用您的账号继续' : '注册以开始您的矩阵运营之旅' }}</p>
        </div>

        <div class="login__switch" role="tablist">
          <button
            type="button"
            :class="{ active: activeTab === 'login' }"
            role="tab"
            :aria-selected="activeTab === 'login'"
            @click="activeTab = 'login'"
          >
            登录
          </button>
          <button
            type="button"
            :class="{ active: activeTab === 'register' }"
            role="tab"
            :aria-selected="activeTab === 'register'"
            @click="activeTab = 'register'"
          >
            注册
          </button>
          <span class="login__switch-thumb" :class="`is-${activeTab}`"></span>
        </div>

        <transition name="fade" mode="out-in">
          <div v-if="activeTab === 'login'" key="login">
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
                <el-button
                  type="primary"
                  :loading="loading"
                  class="login__btn"
                  @click="handleLogin"
                >
                  登录
                </el-button>
              </el-form-item>
            </el-form>
          </div>

          <div v-else key="register">
            <el-form
              ref="registerFormRef"
              :model="registerForm"
              :rules="registerRules"
              label-width="0"
              size="large"
              @submit.prevent="handleRegister"
            >
              <el-form-item prop="name">
                <el-input
                  v-model="registerForm.name"
                  placeholder="用户名 / 昵称"
                  :prefix-icon="User"
                />
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
                <el-button
                  type="primary"
                  :loading="loading"
                  class="login__btn"
                  @click="handleRegister"
                >
                  注册
                </el-button>
              </el-form-item>
            </el-form>
          </div>
        </transition>

        <p class="login__terms">
          登录即代表您同意 <router-link to="/terms">服务条款</router-link> 与
          <router-link to="/privacy">隐私政策</router-link>
        </p>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { User, Lock, Message, Connection, Calendar, TrendCharts } from '@element-plus/icons-vue'
import { useUserStore } from '@/store/user'
import { authApi } from '@/api/auth'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const activeTab = ref<'login' | 'register'>('login')
const loading = ref(false)
const loginFormRef = ref<FormInstance>()
const registerFormRef = ref<FormInstance>()

const currentYear = computed(() => new Date().getFullYear())

const loginForm = reactive({ email: '', password: '' })
const registerForm = reactive({
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
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
  _rule: unknown,
  value: string,
  callback: (error?: Error) => void,
) => {
  if (value !== registerForm.password) {
    callback(new Error('两次密码不一致'))
  } else {
    callback()
  }
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
  } catch {
    /* 错误已由拦截器处理 */
  } finally {
    loading.value = false
  }
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
  } catch {
    /* 错误已由拦截器处理 */
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
.login {
  width: 100%;
  height: 100vh;
  display: flex;
  background-color: $bg-deep;
  position: relative;
  overflow: hidden;
}

// ── 漂浮光斑 ──
.login__orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.55;
  pointer-events: none;
  z-index: 0;

  &--1 {
    width: 480px;
    height: 480px;
    top: -120px;
    left: -80px;
    background: radial-gradient(circle, rgba(99, 102, 241, 0.45), transparent 70%);
    animation: orb-drift-1 22s ease-in-out infinite;
  }

  &--2 {
    width: 360px;
    height: 360px;
    bottom: -100px;
    left: 30%;
    background: radial-gradient(circle, rgba(6, 182, 212, 0.35), transparent 70%);
    animation: orb-drift-2 28s ease-in-out infinite;
  }

  &--3 {
    width: 420px;
    height: 420px;
    top: 30%;
    right: -120px;
    background: radial-gradient(circle, rgba(168, 85, 247, 0.28), transparent 70%);
    animation: orb-drift-3 26s ease-in-out infinite;
  }
}

@keyframes orb-drift-1 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(40px, 30px);
  }
}
@keyframes orb-drift-2 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-30px, -40px);
  }
}
@keyframes orb-drift-3 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-50px, 20px);
  }
}

// ── 左侧品牌墙 ──
.login__brand {
  flex: 1 1 55%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 64px;
  position: relative;
  z-index: 1;
}

.login__brand-inner {
  max-width: 480px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.login__logo {
  display: flex;
  align-items: center;
  gap: 12px;
}

.login__logo-mark {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.12);
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2);
}

.login__logo-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.login__brand-name {
  font-size: 18px;
  font-weight: 600;
  color: $text-primary;
  letter-spacing: -0.01em;
}

.login__brand-tag {
  font-family: $font-mono;
  font-size: 10px;
  color: $text-tertiary;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 500;
}

.login__hero {
  font-size: 48px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.03em;
  color: $text-primary;
  margin: 0;
  background: linear-gradient(135deg, $text-primary 0%, $accent-300 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

.login__hero-sub {
  font-size: 15px;
  line-height: 1.65;
  color: $text-secondary;
  margin: 0;
  max-width: 420px;
}

.login__features {
  list-style: none;
  padding: 0;
  margin: 16px 0 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.login__features li {
  display: flex;
  gap: 14px;
  align-items: flex-start;

  strong {
    display: block;
    color: $text-primary;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 3px;
  }

  p {
    font-size: 13px;
    color: $text-tertiary;
    margin: 0;
    line-height: 1.5;
  }
}

.login__feature-icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.12);
  color: $accent-300;
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.login__footer-note {
  font-size: 11px;
  color: $text-placeholder;
  letter-spacing: 0.05em;
  margin: 16px 0 0;
}

// ── 右侧表单区 ──
.login__form-area {
  flex: 1 1 45%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 64px;
  position: relative;
  z-index: 1;
}

.login__card {
  width: 100%;
  max-width: 400px;
  padding: 36px 32px;
  background: rgba(28, 31, 46, 0.6);
  backdrop-filter: blur(24px) saturate(140%);
  -webkit-backdrop-filter: blur(24px) saturate(140%);
  border: 1px solid $border-base;
  border-radius: $radius-xl;
  box-shadow:
    $shadow-lg,
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.login__card-header {
  margin-bottom: 28px;

  h2 {
    font-size: 22px;
    font-weight: 600;
    color: $text-primary;
    margin: 0 0 6px;
    letter-spacing: -0.02em;
  }

  p {
    font-size: 13px;
    color: $text-tertiary;
    margin: 0;
  }
}

// 切换 segmented control
.login__switch {
  position: relative;
  display: flex;
  margin-bottom: 24px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: $radius-md;
  padding: 4px;

  button {
    flex: 1;
    position: relative;
    z-index: 1;
    padding: 8px 0;
    border: none;
    background: transparent;
    color: $text-tertiary;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: color 0.2s $ease-out;
    border-radius: $radius-sm;

    &.active {
      color: $text-primary;
    }
  }
}

.login__switch-thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(50% - 4px);
  background: rgba(99, 102, 241, 0.18);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: $radius-sm;
  transition: transform 0.25s $ease-out;
  z-index: 0;

  &.is-register {
    transform: translateX(100%);
  }
}

.login__btn {
  width: 100%;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0;
  margin-top: 8px;
}

.login__terms {
  text-align: center;
  font-size: 12px;
  color: $text-placeholder;
  margin: 24px 0 0;
  line-height: 1.6;

  a {
    color: $accent-400;
    transition: color 0.18s $ease-out;

    &:hover {
      color: $accent-300;
      text-decoration: underline;
    }
  }
}

// ── 响应式：窄屏隐藏品牌墙 ──
@media (max-width: 960px) {
  .login__brand {
    display: none;
  }

  .login__form-area {
    flex: 1;
    padding: 24px;
  }
}
</style>
