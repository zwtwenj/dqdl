import http from './request'

/** 单 NPC 详情 GET /api/npc/:id */
export const getNpc = (npcId) => http.get(`/npc/${npcId}`)

/** 某地点 NPC 列表 GET /api/npc/location/:locationId?type=node|scene
 *  type 显式区分节点/场景，避免后端按 id 撞号误判。
 *  - 'node'（默认）：玩家站在地图节点上
 *  - 'scene'      ：玩家进了场景
 */
export const getNpcsByLocation = (locationId, type = 'node') =>
  http.get(`/npc/location/${locationId}`, { params: { type } })

/** 创建对话会话 POST /api/npc/:npcId/session { playerId } → { sessionId, npc }
 *  打开弹窗时调一次，server 建 dialog_session（记忆权威源） */
export const createNpcSession = (npcId, playerId) =>
  http.post(`/npc/${npcId}/session`, { playerId })

/** 会话内对话 POST /api/npc/session/:sessionId/talk { message } → { reply, callId }
 *  历史由 server 从 session.messages 提取，前端只传 message（开场白传空串） */
export const talkInSession = (sessionId, message) =>
  http.post(`/npc/session/${sessionId}/talk`, { message })
