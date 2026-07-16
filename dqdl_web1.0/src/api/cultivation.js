import http from './request'

/**
 * 统一修炼接口（对应后端 /api/cultivation/*，合并洞天福地 + 修炼室）。
 *
 *   getCultivationConfig()              修炼室档位 + 时长范围 + 可修炼的斗技/功法列表（供选档态）
 *   enterCultivation({scene,...})       进入：blessed{encounterId} / room{tier,duration}
 *   getCurrentCultivation()             当前进行中的会话
 *   getCultivationLatest()              最近一次会话（结算页）
 *   resumeCultivation()                 重连补偿（断线后按实际时间补发）
 *   stopCultivation()                   主动停止
 *   cultivationStreamUrl()              SSE 流 URL（EventSource 用，token 走 query）
 */

/** 修炼室档位信息 GET /api/cultivation/config */
export const getCultivationConfig = () => http.get('/cultivation/config')

/**
 * 进入修炼 POST /api/cultivation/enter
 * @param payload
 *   - blessed（洞天福地）：{ scene:'blessed', encounterId }
 *   - room（修炼室）修为： { scene:'room', tier, duration }（duration=分钟）
 *   - room 修炼斗技：      { scene:'room', tier, duration, mode:'skill', targetId }
 *   - room 修炼功法：      { scene:'room', tier, duration, mode:'technique', targetId }
 */
export const enterCultivation = (payload) => http.post('/cultivation/enter', payload)

/** 当前进行中的修炼会话 GET /api/cultivation/current */
export const getCurrentCultivation = () => http.get('/cultivation/current')

/** 最近一次会话（含已结束）GET /api/cultivation/latest */
export const getCultivationLatest = () => http.get('/cultivation/latest')

/** 重连补偿（惰性离线结算）GET /api/cultivation/resume */
export const resumeCultivation = () => http.get('/cultivation/resume')

/** 主动停止 POST /api/cultivation/stop → { ok, session } */
export const stopCultivation = () => http.post('/cultivation/stop')

/**
 * 修炼 SSE 流 URL（EventSource 用，token 走 query）。
 * EventSource 无法设 Authorization header，故 token 拼 URL。
 */
export const cultivationStreamUrl = () => {
  const token = localStorage.getItem('dqdl_token')
  return `/api/cultivation/stream?token=${encodeURIComponent(token || '')}`
}
