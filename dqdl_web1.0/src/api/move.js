import http from './request'

/** 预览移动时间 GET /api/move/preview/:toNetId → { duration_sec, duration_min, to_name, ... } */
export const previewMove = (toNetId) =>
  http.get(`/move/preview/${toNetId}`)

/** 开始移动 POST /api/move/start  body:{line:[{id,name,gx,gy},...]} → session(含 end_at)
 *  line 由前端 findPath 寻路得到（寻路/移动解耦：startMove 只接收路径落库）。 */
export const startMove = (line) =>
  http.post(`/move/start`, { line })

/** 取消移动 POST /api/move/cancel */
export const cancelMove = () =>
  http.post(`/move/cancel`)

/** 查当前移动 GET /api/move/current → session | null */
export const getCurrentMove = () =>
  http.get(`/move/current`)

/** 到达结算 POST /api/move/arrive → { session, to_net_id } */
export const arriveMove = () =>
  http.post(`/move/arrive`)
