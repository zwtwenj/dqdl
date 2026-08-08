import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// 管理平台路由：登录页 + 布局(含子路由)。beforeEach 守卫无 token 跳登录。
const routes = [
  { path: '/login', name: 'login', component: () => import('../views/Login.vue') },
  {
    path: '/',
    component: () => import('../layouts/AdminLayout.vue'),
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: 'Agent 日志总览' } },
      { path: 'agent-log', name: 'agent-log', component: () => import('../views/AgentLog.vue'), meta: { title: '调用明细' } },
      { path: 'agent-dialog', name: 'agent-dialog', component: () => import('../views/AgentDialog.vue'), meta: { title: '对话明细' } },
      { path: 'db', name: 'db', component: () => import('../views/DbViewer.vue'), meta: { title: '数据库浏览' } },
      { path: 'events', name: 'events', component: () => import('../views/EventManage.vue'), meta: { title: '事件管理' } },
      { path: 'events/:id', name: 'event-detail', component: () => import('../views/EventDetail.vue'), meta: { title: '事件详情' } },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// 全局守卫：无 token 跳登录（除 /login 外）
router.beforeEach((to) => {
  const auth = useAuthStore()
  if (!auth.isLoggedIn && to.name !== 'login') {
    return { name: 'login' }
  }
  if (auth.isLoggedIn && to.name === 'login') {
    return { name: 'dashboard' }
  }
})

export default router
