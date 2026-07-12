import http from './request'

/** 按 NPC 查商品列表 GET /api/shop/npc/:npcId → { npcName, roleId, items } */
export const getNpcShop = (npcId) => http.get(`/shop/npc/${npcId}`)

/** 购买 POST /api/shop/buy { playerId, itemId, count } → { money }
 *  返回更新后的 money（前端 store 同步），buy/sell 后端单事务完成扣钱+加背包 */
export const buyItem = (playerId, itemId, count) =>
  http.post('/shop/buy', { playerId, itemId, count })

/** 出售 POST /api/shop/sell { playerId, itemId, count } → { money, remaining }
 *  售价由后端计算（price/2），前端不参与 DB 派生运算 */
export const sellItem = (playerId, itemId, count) =>
  http.post('/shop/sell', { playerId, itemId, count })
