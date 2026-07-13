import http from './request'

/** 管理员登录 POST /api/auth/login { username, password } → { token, user } */
export const login = (username, password) =>
  http.post('/auth/login', { username, password })
