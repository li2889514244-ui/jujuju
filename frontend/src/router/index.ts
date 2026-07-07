import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import { useUserStore } from '@/store/user'

NProgress.configure({ showSpinner: false })

/**
 * 解析 JWT payload，检查 token 是否即将过期
 * 返回 true 表示 token 有效（或无法解析时不拦截），false 表示已过期
 */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const payload = JSON.parse(atob(parts[1]))
    if (!payload.exp) return false
    // 提前 60 秒判定为过期，留出刷新窗口
    const now = Math.floor(Date.now() / 1000)
    return payload.exp < now + 60
  } catch {
    return false
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/LoginView.vue'),
    meta: { title: '登录', requiresAuth: false },
  },
  {
    path: '/',
    component: () => import('@/components/layout/AppLayout.vue'),
    redirect: '/dashboard',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/MatrixDashboard.vue'),
        meta: { title: '矩阵数据', icon: 'Odometer', section: '总览' },
      },
      {
        path: 'content-insights',
        name: 'ContentInsights',
        component: () => import('@/views/insights/ContentInsightsView.vue'),
        meta: { title: '内容洞察', icon: 'DataAnalysis', section: '总览' },
      },
      {
        path: 'accounts',
        name: 'AccountList',
        component: () => import('@/views/accounts/AccountListView.vue'),
        meta: { title: '账号接入', icon: 'User', section: '运营流程' },
      },
      {
        path: 'accounts/:id',
        name: 'AccountDetail',
        component: () => import('@/views/accounts/AccountDetailView.vue'),
        meta: { title: '账号详情', hidden: true },
      },
      {
        path: 'monetization',
        name: 'Monetization',
        component: () => import('@/views/monetization/MonetizationView.vue'),
        meta: { title: '微信小店', icon: 'Money', section: '商业转化' },
      },
      {
        path: 'doudian',
        name: 'Doudian',
        component: () => import('@/views/monetization/DoudianView.vue'),
        meta: { title: '抖店', icon: 'Money', section: '商业转化' },
      },
      {
        path: 'team',
        name: 'Team',
        component: () => import('@/views/team/TeamView.vue'),
        meta: {
          title: '团队管理',
          icon: 'UserFilled',
          section: '组织设置',
          roles: ['OWNER', 'ADMIN', 'MANAGER'],
        },
      },
      {
        path: 'team/permissions',
        name: 'Permissions',
        component: () => import('@/views/team/PermissionView.vue'),
        meta: { title: '权限管理', hidden: true, roles: ['OWNER', 'ADMIN'] },
      },
      {
        path: 'platforms',
        name: 'Platforms',
        component: () => import('@/views/platforms/PlatformManageView.vue'),
        meta: { title: '平台配置', icon: 'Connection', section: '组织设置' },
      },
      {
        path: 'mcp',
        name: 'MCPConnection',
        component: () => import('@/views/mcp/MCPConnectionView.vue'),
        meta: { title: 'MCP 接入', icon: 'Connection', section: '组织设置' },
      },
      {
        path: 'feishu',
        name: 'FeishuSettings',
        component: () => import('@/views/settings/FeishuSettingsView.vue'),
        meta: { title: '飞书通知', icon: 'Bell', section: '组织设置' },
      },
      {
        path: 'calendar',
        name: 'Calendar',
        component: () => import('@/views/calendar/CalendarView.vue'),
        meta: { title: '内容日历', icon: 'Calendar', section: '运营流程' },
      },
      {
        path: 'ai',
        name: 'AIAssistant',
        component: () => import('@/views/ai/AIAssistantView.vue'),
        meta: { title: 'AI 助手', icon: 'MagicStick', hidden: true },
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/settings/ProfileView.vue'),
        meta: { title: '个人设置', icon: 'User', hidden: true },
      },
      {
        path: 'password',
        name: 'Password',
        component: () => import('@/views/settings/PasswordView.vue'),
        meta: { title: '修改密码', icon: 'Lock', hidden: true },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
})

// Navigation guard
router.beforeEach((to, _from, next) => {
  NProgress.start()
  document.title = `${to.meta.title || '披星云'} - 矩阵管理平台`

  const userStore = useUserStore()
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth !== false)

  // 检查 token 是否存在
  if (requiresAuth && !userStore.token) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  // 检查 token 是否即将过期（提前 60 秒）
  // 如果有 refreshToken，让请求拦截器自动刷新；如果没有则跳转登录
  if (requiresAuth && userStore.token && isTokenExpired(userStore.token)) {
    if (!userStore.refreshToken) {
      userStore.logout()
      next({ name: 'Login', query: { redirect: to.fullPath } })
      return
    }
    // 有 refreshToken 时，让请求拦截器自动处理刷新，不阻断路由
  }

  // 已登录用户不允许访问登录页
  if (to.name === 'Login' && userStore.token) {
    next({ name: 'Dashboard' })
    return
  }

  // 角色权限检查
  const requiredRoles = to.meta.roles as string[] | undefined
  if (requiredRoles && requiredRoles.length > 0) {
    const userRole = userStore.userInfo?.role
    if (!userRole || !requiredRoles.includes(userRole)) {
      // 无权访问，重定向到仪表盘
      next({ name: 'Dashboard' })
      return
    }
  }

  next()
})

router.afterEach(() => {
  NProgress.done()
})

export default router
