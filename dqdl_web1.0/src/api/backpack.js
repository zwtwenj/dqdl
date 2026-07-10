import http from './request'

/** 获取玩家背包（含物品详情 + 金币） GET /api/backpack/:playerId → { money, slots } */
export const getBackpack = (playerId) => http.get(`/backpack/${playerId}`)

/** 拖拽移动物品（交换两个 slot） POST /api/backpack/:playerId/move { fromSlot, toSlot } */
export const moveBackpackItem = (playerId, fromSlot, toSlot) =>
  http.post(`/backpack/${playerId}/move`, { fromSlot, toSlot })

/** 整理背包（按 item_id 排序） POST /api/backpack/:playerId/sort */
export const sortBackpack = (playerId) =>
  http.post(`/backpack/${playerId}/sort`)
