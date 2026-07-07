import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'start',
    component: () => import('../views/StartView.vue'),
  },
  // 后续游戏主界面、角色面板等路由在此追加
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
