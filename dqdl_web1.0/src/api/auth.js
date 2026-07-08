import http from './request'

/** 登录 POST /api/auth/login → { token, user } */
export const login = (username, password) =>
  http.post('/auth/login', { username, password })

/** 注册 POST /api/auth/register */
export const register = (username, password) =>
  http.post('/auth/register', { username, password })
