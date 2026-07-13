import http from './request'

/** 玩家可见奇遇列表（pending 未进入 + entered 进行中）GET /api/encounter */
export const getEncounters = () => http.get('/encounter')

/** 放弃奇遇（仅 pending）POST /api/encounter/:id/abandon → 返回刷新后的列表 */
export const abandonEncounter = (id) => http.post(`/encounter/${id}/abandon`)
