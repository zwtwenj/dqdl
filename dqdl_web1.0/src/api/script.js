/**
 * 剧本触发 SSE 流 URL（EventSource 用，token 走 query）。
 * EventSource 无法设 Authorization header，故 token 拼 URL（与修炼 SSE 一致）。
 *
 * 玩家进入游戏后建立长连接，剧本命中时后端推送 event:trigger。
 */
export const scriptStreamUrl = () => {
  const token = localStorage.getItem('dqdl_token')
  return `/api/script/stream?token=${encodeURIComponent(token || '')}`
}
