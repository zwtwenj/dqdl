import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

/** 登录 POST /api/auth/login → { token, user } */
export const login = (username, password) =>
  api.post('/auth/login', { username, password })

/** 注册 POST /api/auth/register */
export const register = (username, password) =>
  api.post('/auth/register', { username, password })

/** 列出当前账号存档 GET /api/save */
export const getSaves = (token) =>
  api.get('/save', { headers: { Authorization: `Bearer ${token}` } })

/** 创建存档 POST /api/save */
export const createSave = (token, name, content = {}) =>
  api.post('/save', { name, content }, { headers: { Authorization: `Bearer ${token}` } })

/** 更新存档内容 PATCH /api/save/:slot */
export const updateSave = (token, slot, content) =>
  api.patch(`/save/${slot}`, { content }, { headers: { Authorization: `Bearer ${token}` } })

/** 删除存档 DELETE /api/save/:slot */
export const deleteSave = (token, slot) =>
  api.delete(`/save/${slot}`, { headers: { Authorization: `Bearer ${token}` } })

export default api
