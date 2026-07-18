import http from './request'

/** 列出当前账号的角色 GET /api/character */
export const getCharacters = () => http.get('/character')

/** 创建角色 POST /api/game/create { name } */
export const createCharacter = (name) =>
  http.post('/game/create', { name })

/** 进入角色 POST /api/game/enter/:slot （返回含 pending_states 进行中事件） */
export const enterCharacter = (slot) =>
  http.post(`/game/enter/${slot}`, {})

/**
 * 查询玩家进行中的事件 GET /api/game/pending-states（刷新页面恢复用）。
 * 返回 [{type, data}]：剧本(script)/修炼(cultivation) 等，前端按 type 分发恢复。
 */
export const getPendingStates = () =>
  http.get('/game/pending-states')

/** 删除角色 DELETE /api/game/delete/:slot */
export const deleteCharacter = (slot) =>
  http.delete(`/game/delete/${slot}`)
