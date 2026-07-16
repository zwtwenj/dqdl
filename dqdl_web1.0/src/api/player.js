import http from './request'

/** 获取玩家完整信息（含 final_attrs） GET /api/player/:id */
export const getPlayer = (id) => http.get(`/player/${id}`)

/** 轻量状态查询 GET /api/player/:id/status */
export const getPlayerStatus = (id) => http.get(`/player/${id}/status`)

/** 修炼 POST /api/player/:id/cultivate */
export const cultivate = (id) => http.post(`/player/${id}/cultivate`)

/** 突破 POST /api/player/:id/breakthrough */
export const breakthrough = (id) => http.post(`/player/${id}/breakthrough`)

/** 切换当前地点 POST /api/player/:id/move { locationId } */
export const movePlayerLocation = (id, locationId) =>
  http.post(`/player/${id}/move`, { locationId })

/** 更新斗技装配 POST /api/player/:id/skill { skill } skill 为 JSON 字符串 */
export const updatePlayerSkills = (id, skillJson) =>
  http.post(`/player/${id}/skill`, { skill: skillJson })

/** 更新功法装配 POST /api/player/:id/technique { technique } technique 为 JSON 字符串 */
export const updatePlayerTechniques = (id, techniqueJson) =>
  http.post(`/player/${id}/technique`, { technique: techniqueJson })

/** 功法突破 POST /api/player/:id/technique/breakthrough { techniqueId, rate } */
export const breakthroughTechnique = (id, techniqueId, rate) =>
  http.post(`/player/${id}/technique/breakthrough`, { techniqueId, rate })
