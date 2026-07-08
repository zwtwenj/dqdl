import http from './request'

/** 列出当前账号的角色 GET /api/character */
export const getCharacters = () => http.get('/character')

/** 创建角色 POST /api/game/create { name } */
export const createCharacter = (name) =>
  http.post('/game/create', { name })

/** 进入角色 POST /api/game/enter/:slot */
export const enterCharacter = (slot) =>
  http.post(`/game/enter/${slot}`, {})

/** 删除角色 DELETE /api/game/delete/:slot */
export const deleteCharacter = (slot) =>
  http.delete(`/game/delete/${slot}`)
