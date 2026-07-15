import http from './request'

/**
 * 洞天福地修炼接口（对应后端 /api/cultivation/*）。
 *
 * 进入由 cultivate 类型奇遇触发：enter 消耗奇遇建会话，
 * 前端开 EventSource 接 /stream（?token= 带 JWT）收结算推送，
 * 到 max_rounds 自动结束；玩家可主动 stop。
 */

/** 进入洞天福地 POST /api/cultivation/enter { encounterId } → 会话（含 interval） */
export const enterCultivation = (encounterId) =>
  http.post('/cultivation/enter', { encounterId })

/** 当前进行中的修炼会话 GET /api/cultivation/current */
export const getCurrentCultivation = () => http.get('/cultivation/current')

/** 主动停止修炼 POST /api/cultivation/stop */
export const stopCultivation = () => http.post('/cultivation/stop')

/**
 * 修炼 SSE 流 URL（EventSource 用，token 走 query）。
 * EventSource 无法设 Authorization header，故 token 拼 URL。
 */
export const cultivationStreamUrl = () => {
  const token = localStorage.getItem('dqdl_token')
  return `/api/cultivation/stream?token=${encodeURIComponent(token || '')}`
}
