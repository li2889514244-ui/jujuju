import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'
import { useUserStore } from '@/store/user'

NProgress.configure({ showSpinner: false })

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
        path: 'content',
        name: 'ContentEditor',
        component: () => import('@/views/content/ContentEditorView.vue'),
        meta: { title: '内容制作', icon: 'EditPen', section: '运营流程' },
      },
      {
        path: 'publish',
        name: 'Publish',
        component: () => import('@/views/content/PublishView.vue'),
        meta: { title: '发布排期', icon: 'Promotion', section: '运营流程' },
      },
      {
        path: 'monetization',
        name: 'Monetization',
        component: () => import('@/views/monetization/MonetizationView.vue'),
        meta: { title: '微信小店', icon: 'Money', section: '商业转化' },
      },
      {
        path: 'report',
        name: 'Report',
        component: () => import('@/views/report/ReportView.vue'),
        meta: { title: '报表导出', icon: 'Document', section: '数据复盘' },
      },
      {
        path: 'team',
        name: 'Team',
        component: () => import('@/views/team/TeamView.vue'),
        meta: { title: '团队管理', icon: 'UserFilled', section: '组织设置' },
      },
      {
        path: 'team/permissions',
        name: 'Permissions',
        component: () => import('@/views/team/PermissionView.vue'),
        meta: { title: '权限管理', hidden: true },
      },
      {
        path: 'platforms',
        name: 'Platforms',
        component: () => import('@/views/platforms/PlatformManageView.vue'),
        meta: { title: '平台配置', icon: 'Connection', section: '组织设置' },
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
        path: 'mcp',
        name: 'MCPAssistant',
        component: () => import('@/views/mcp/MCPAssistantView.vue'),
        meta: { title: 'MCP 查询', icon: 'ChatDotSquare', hidden: true },
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

  if (requiresAuth && !userStore.token) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else if (to.name === 'Login' && userStore.token) {
    next({ name: 'Dashboard' })
  } else {
    next()
  }
})

router.afterEach(() => {
  NProgress.done()
})

export default router
