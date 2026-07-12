import http from './request'

/** 按 NPC 查商品列表 GET /api/shop/npc/:npcId → { npcName, roleId, items } */
export const getNpcShop = (npcId) => http.get(`/shop/npc/${npcId}`)
