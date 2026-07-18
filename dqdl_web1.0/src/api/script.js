import http from './request'

/**
 * 剧本触发 SSE 流 URL（EventSource 用，token 走 query）。
 * EventSource 无法设 Authorization header，故 token 拼 URL（与修炼 SSE 一致）。
 *
 * 玩家进入游戏后建立长连接，剧本命中时后端推送 event:script_trigger。
 */
export const scriptStreamUrl = () => {
  const token = localStorage.getItem('dqdl_token')
  return `/api/script/stream?token=${encodeURIComponent(token || '')}`
}

/**
 * 获取某剧本实例的当前节点完整信息（含映射后的真实 NPC 信息）。
 * 前端收到 SSE script_trigger（含 instance_id，status=playing）后调此接口。
 * @returns { instance_id, node_id, lines, choices, end, location, actors }
 *          actors 里每个含 key/type/info（dynamic_npc 的 info 有 name/gender/role/nature）
 */
export const getScriptNode = (instanceId) =>
  http.get(`/script/instance/${instanceId}/node`)

