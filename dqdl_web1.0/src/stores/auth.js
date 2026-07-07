import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as apiLogin, getSaves } from '../api'

const TOKEN_KEY = 'dqdl_token'
const USER_KEY = 'dqdl_user'

/**
 * 鉴权 store：管理登录态与 JWT。
 * token 持久化到 localStorage，刷新页面不丢失。
 * saves 缓存当前账号的存档列表（登录后/创建存档后刷新）。
 */
export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref(JSON.parse(localStorage.getItem(USER_KEY) || 'null'))
  const saves = ref([])

  /** 是否已登录 */
  const isLoggedIn = computed(() => !!token.value)

  /** 登录：成功后存 token，并拉取该账号的存档列表 */
  async function login(username, password) {
    const res = await apiLogin(username, password)
    token.value = res.data.token
    user.value = res.data.user
    localStorage.setItem(TOKEN_KEY, res.data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(res.data.user))
    await fetchSaves()
    return res.data
  }

  /** 登出 */
  function logout() {
    token.value = ''
    user.value = null
    saves.value = []
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  /** 拉取当前账号的存档列表并缓存到 store */
  async function fetchSaves() {
    if (!token.value) {
      saves.value = []
      return []
    }
    const res = await getSaves(token.value)
    saves.value = res.data
    return res.data
  }

  return { token, user, saves, isLoggedIn, login, logout, fetchSaves }
})
