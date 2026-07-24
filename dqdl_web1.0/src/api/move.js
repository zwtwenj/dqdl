import http from './request'

/** 预览移动时间 GET /api/move/preview/:toNetId → { duration_sec, duration_min, to_name, ... } */
export const previewMove = (toNetId) =>
  http.get(`/move/preview/${toNetId}`)

/** 开始移动 POST /api/move/start/:toNetId → session(含 end_at) */
export const startMove = (toNetId) =>
  http.post(`/move/start/${toNetId}`)

/** 取消移动 POST /api/move/cancel */
export const cancelMove = () =>
  http.post(`/move/cancel`)

/** 查当前移动 GET /api/move/current → session | null */
export const getCurrentMove = () =>
  http.get(`/move/current`)

/** 到达结算 POST /api/move/arrive → { session, to_net_id } */
export const arriveMove = () =>
  http.post(`/move/arrive`)
