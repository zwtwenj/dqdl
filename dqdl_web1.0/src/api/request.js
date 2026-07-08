import axios from 'axios'
import { bus, BusEvents } from '../utils/eventBus'
import { useAuthStore } from '../stores/auth'

/**
 * axios 实例 + 拦截器（统一鉴权与响应解包）。
 *
 * - request 拦截器：自动从 localStorage 读 token，注入 Authorization 头。
 * - response 拦截器：解包 { code, message, data }，
 *   code=0 返回 data；code=1002(未登录) 弹提示→登出→跳登录页；其余抛 Error(message)。
 *
 * 业务层调用不再需要手动传 token，也不再需要 res.data.data 取值。
 */
const TOKEN_KEY = 'dqdl_token'

const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// 请求拦截：自动注入 token
http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** 弹 toast 提示 */
function toast(type, message) {
  bus.emit(BusEvents.TOAST, { type, message })
}

/** token 失效：弹提示 → 登出清状态 → 跳登录页 */
function handleUnauthorized(message) {
  toast('error', message || '登录已失效，请重新登录')
  // 调 store 登出：清 token/user/characters，isLoggedIn→false，LoginPanel 显示
  try {
    const auth = useAuthStore()
    auth.logout()
  } catch {
    // store 未初始化（pinia 未挂载）兜底
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem('dqdl_user')
  }
  // 延迟跳转，让 toast 显示出来
  setTimeout(() => {
    if (location.hash !== '#/') {
      location.hash = '#/'
    }
  }, 800)
}

// 响应拦截：统一解包
http.interceptors.response.use(
  (response) => {
    const body = response.data
    // 非标准响应体（如二进制流）直接返回
    if (!body || typeof body !== 'object' || !('code' in body)) {
      return body
    }
    // code=0 成功，返回 data
    if (body.code === 0) {
      return body.data
    }
    // 1002 未登录或 token 失效：弹提示后跳登录
    if (body.code === 1002) {
      handleUnauthorized(body.message)
    }
    // 其他业务错误：抛 Error，调用方 try/catch 或 .catch 处理
    const err = new Error(body.message || '请求失败')
    err.code = body.code
    err.response = response
    return Promise.reject(err)
  },
  (error) => {
    // 网络错误 / 超时 / 非 200（后端异常过滤器已保证 200，这里兜底）
    let msg = '网络错误'
    if (error.code === 'ECONNABORTED') msg = '请求超时'
    else if (error.response?.status === 401) {
      handleUnauthorized()
      msg = '登录已失效'
    } else if (error.response?.status === 404) msg = '接口不存在'
    else if (error.response?.data?.message) msg = error.response.data.message
    const err = new Error(msg)
    err.code = error.response?.status || 0
    return Promise.reject(err)
  },
)

export default http
