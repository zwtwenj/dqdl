import http from './request'

/**
 * 使用物品（通用，按 item.type 分发：丹药/宝物等）。
 * POST /api/item/:playerId/use { itemId, targetSlot? } → { player, remaining }
 * player 为聚合后数据（含 final_attrs/treasures），前端可直接覆盖刷新。
 * targetSlot 仅宝物装备时用：拖拽到指定槽位（1~5）。丹药忽略。
 */
export const useItem = (playerId, itemId, targetSlot) =>
  http.post(`/item/${playerId}/use`, { itemId, targetSlot })

/**
 * 卸下宝物（从 player.treasures 删一条 + 返还物品形态到背包）。
 * POST /api/backpack/:playerId/treasure/unequip { slot } → { player }
 */
export const unequipTreasure = (playerId, slot) =>
  http.post(`/backpack/${playerId}/treasure/unequip`, { slot })
