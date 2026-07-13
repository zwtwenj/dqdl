import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as loginApi } from '../api/auth'

// 管理员鉴权 store：token 持久化到 localStorage（键名区别于游戏前端 dqdl_token）
export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('dqdl_admin_token') || '')
  const user = ref(JSON.parse(localStorage.getItem('dqdl_admin_user') || 'null'))

  const isLoggedIn = computed(() => !!token.value)

  async function login(username, password) {
    const data = await loginApi(username, password)
    token.value = data.token
    user.value = data.user
    localStorage.setItem('dqdl_admin_token', data.token)
    localStorage.setItem('dqdl_admin_user', JSON.stringify(data.user))
    return data
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('dqdl_admin_token')
    localStorage.removeItem('dqdl_admin_user')
  }

  return { token, user, isLoggedIn, login, logout }
})
