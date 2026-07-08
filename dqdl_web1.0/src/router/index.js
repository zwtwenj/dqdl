import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'start',
    component: () => import('../views/StartView.vue'),
  },
  {
    path: '/game',
    name: 'game',
    component: () => import('../views/GameView.vue'),
  },
  // 后续角色面板等路由在此追加
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
