import http from './request'

/** 使用 1 颗丹药 POST /api/pill/:playerId/use { itemId } → { player, remaining }
 *  后端单事务完成扣背包+应用效果，返回聚合后的 player（含 final_attrs）供整体刷新 */
export const usePill = (playerId, itemId) =>
  http.post(`/pill/${playerId}/use`, { itemId })
