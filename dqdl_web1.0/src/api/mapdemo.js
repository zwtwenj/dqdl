import http from './request'

/**
 * 网状地图 + 场景 接口（对应后端 /api/location_net/*）。
 * 需登录：玩家身份由 JWT 推导（后端 Controller 类级 @UseGuards(JwtAuthGuard)，
 * 每个 handler 调 verifyOwnershipByUser(req.user.id) 取当前账号的 player）。
 */

/** 全图：节点 + 边（4 对角邻接） */
export const getMapGraph = () => http.get('/location_net/graph')

/** 矩形范围查询：大地图视口增量加载用。返回 { nodes, edges } */
export const getNodesInBBox = (minGX, minGY, maxGX, maxGY) =>
  http.get('/location_net/bbox', { params: { minGX, minGY, maxGX, maxGY } })

/** 寻路：fromId → toId 的最短路径。返回 { path: [{id,name,gx,gy,...}] | null } */
export const findPath = (fromId, toId) =>
  http.get('/location_net/path', { params: { from: fromId, to: toId } })

/** 玩家视野：ring0+ring1 可见 + ring2 迷雾（前端画地图主用这个） */
export const getPlayerView = () => http.get('/location_net/view')

/** 单节点 */
export const getMapNode = (id) => http.get(`/location_net/${id}`)

/** 该地图的场景列表 */
export const getMapScenes = (id) => http.get(`/location_net/${id}/scenes`)

/** 出口列表（4 对角：open + unknown 桩） */
export const getMapExits = (id) => http.get(`/location_net/${id}/exits`)

/** 拓展前沿：把某节点的一个 unknown 桩变成新节点（+ 新城市自动补场景） */
export const expandFrontier = (id, direction) =>
  http.post(`/location_net/${id}/expand`, { direction })

// ---------- 玩家位置 ----------
/** 当前位置（地图 + 场景） */
export const getPlayerPos = () => http.get('/location_net/pos')

/** 移动到相邻地图节点 */
export const moveToNet = (netId) => http.post(`/location_net/move/${netId}`)

/** 进入场景 */
export const enterScene = (netId, sceneType) =>
  http.post(`/location_net/${netId}/scene/${sceneType}/enter`)

/** 退出场景 */
export const exitScene = () => http.post('/location_net/scene/exit')
