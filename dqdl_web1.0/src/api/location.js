import http from './request'

/** 地图根节点 GET /api/location/root */
export const getRootLocation = () => http.get('/location/root')

/** 子节点 GET /api/location/:locationId/children */
export const getLocationChildren = (locationId) =>
  http.get(`/location/${locationId}/children`)

/** 同级兄弟节点 GET /api/location/:locationId/siblings */
export const getLocationSiblings = (locationId) =>
  http.get(`/location/${locationId}/siblings`)

/** 展开子节点（AI 懒生成） POST /api/location/:locationId/expand */
export const expandLocation = (locationId) =>
  http.post(`/location/${locationId}/expand`)

/** 单个地点详情 GET /api/location/:locationId */
export const getLocation = (locationId) =>
  http.get(`/location/${locationId}`)
