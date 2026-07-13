import axios from 'axios'
import { ElMessage } from 'element-plus'

// axios 封装：baseURL /api，token 注入，{code,message,data} 解包，401 跳登录
const http = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// 请求拦截：注入管理员 token
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('dqdl_admin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截：解包 { code, message, data }
http.interceptors.response.use(
  (res) => {
    // 管理后端 NestJS 默认返回体即为业务对象（含 token/list 等），
    // 非标准 {code,message,data} 结构（与游戏后端约定不同，管理后端直接返回数据）。
    // 网络层 HTTP 200 即业务成功；错误统一走 catch。
    return res.data
  },
  (err) => {
    const status = err.response?.status
    const msg = err.response?.data?.message || err.message
    if (status === 401) {
      // token 失效：清登录态 + 跳登录
      localStorage.removeItem('dqdl_admin_token')
      localStorage.removeItem('dqdl_admin_user')
      if (location.hash !== '#/login') {
        location.hash = '#/login'
      }
    } else {
      ElMessage.error(typeof msg === 'string' ? msg : '请求失败')
    }
    return Promise.reject(err)
  },
)

export default http
