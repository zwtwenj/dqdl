import http from './request'

/** 事件列表分页 GET /api/events/list?page=&size=&keyword= */
export const getEventList = (page = 1, size = 20, keyword) =>
  http.get('/events/list', { params: { page, size, keyword: keyword || undefined } })

/** 事件详情 GET /api/events/:id */
export const getEvent = (id) => http.get(`/events/${id}`)

/** 生成新事件 POST /api/events/generate */
export const generateEvent = (prompt) =>
  http.post('/events/generate', { prompt: prompt || undefined })

/** 保存连线配置 POST /api/events/:id/connect-config { edge, config } */
export const saveConnectConfig = (id, edge, config) =>
  http.post(`/events/${id}/connect-config`, { edge, config })

/** 保存事件触发配置 POST /api/events/:id/trigger-config { config } */
export const saveTriggerConfig = (id, config) =>
  http.post(`/events/${id}/trigger-config`, { config })
