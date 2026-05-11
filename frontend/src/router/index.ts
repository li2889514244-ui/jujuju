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
        component: () => import('@/views/dashboard/DashboardView.vue'),
        meta: { title: '仪表盘', icon: 'Odometer' },
      },
      {
        path: 'accounts',
        name: 'AccountList',
        component: () => import('@/views/accounts/AccountListView.vue'),
        meta: { title: '账号管理', icon: 'User' },
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
        meta: { title: '内容编辑', icon: 'EditPen' },
      },
      {
        path: 'publish',
        name: 'Publish',
        component: () => import('@/views/content/PublishView.vue'),
        meta: { title: '发布管理', icon: 'Promotion' },
      },
      {
        path: 'analytics',
        name: 'Analytics',
        component: () => import('@/views/analytics/AnalyticsView.vue'),
        meta: { title: '数据分析', icon: 'DataAnalysis' },
      },
      {
        path: 'report',
        name: 'Report',
        component: () => import('@/views/report/ReportView.vue'),
        meta: { title: '数据报表', icon: 'Document' },
      },
      {
        path: 'team',
        name: 'Team',
        component: () => import('@/views/team/TeamView.vue'),
        meta: { title: '团队管理', icon: 'UserFilled' },
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
        meta: { title: '平台管理', icon: 'Connection' },
      },
      {
        path: 'competitors',
        name: 'Competitors',
        component: () => import('@/views/competitors/CompetitorView.vue'),
        meta: { title: '竞对监测', icon: 'Aim' },
      },
      {
        path: 'ai',
        name: 'AIAssistant',
        component: () => import('@/views/ai/AIAssistantView.vue'),
        meta: { title: 'AI 助手', icon: 'MagicStick' },
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
  document.title = `${to.meta.title || 'MatrixFlow'} - 矩阵管理平台`

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
