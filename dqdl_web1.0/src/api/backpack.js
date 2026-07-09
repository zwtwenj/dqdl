import http from './request'

/** 获取玩家背包（含物品详情聚合） GET /api/backpack/:playerId */
export const getBackpack = (playerId) => http.get(`/backpack/${playerId}`)
