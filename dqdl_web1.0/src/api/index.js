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

// ── 角色 ──

/** 列出当前账号的角色 GET /api/character */
export const getCharacters = (token) =>
  api.get('/character', { headers: { Authorization: `Bearer ${token}` } })

/** 创建角色 POST /api/game/create { name } */
export const createCharacter = (token, name) =>
  api.post('/game/create', { name }, { headers: { Authorization: `Bearer ${token}` } })

/** 进入角色 POST /api/game/enter/:slot */
export const enterCharacter = (token, slot) =>
  api.post(`/game/enter/${slot}`, {}, { headers: { Authorization: `Bearer ${token}` } })

/** 删除角色 DELETE /api/game/delete/:slot */
export const deleteCharacter = (token, slot) =>
  api.delete(`/game/delete/${slot}`, { headers: { Authorization: `Bearer ${token}` } })

// ── 地图 ──

/** 地图根节点 GET /api/location/root */
export const getRootLocation = (token) =>
  api.get('/location/root', { headers: { Authorization: `Bearer ${token}` } })

/** 子节点 GET /api/location/:locationId/children */
export const getLocationChildren = (token, locationId) =>
  api.get(`/location/${locationId}/children`, { headers: { Authorization: `Bearer ${token}` } })

export default api
