import http from './request'

/**
 * 任务接口（对应后端 /api/task/*）。
 */

/** 预览佣兵任务候选（不入库）→ { ok, task?, msg? } */
export const previewAdventurerTask = (playerId) =>
  http.post('/task/adventurer/preview', { playerId })

/** 接受候选任务（入 task 表）→ { ok, task?, msg? } */
export const acceptAdventurerTask = (playerId, draft) =>
  http.post('/task/adventurer/accept', { playerId, draft })

/** 查我的进行中任务 */
export const getMyTasks = (playerId) => http.get(`/task/mine/${playerId}`)

/** 交付任务领奖 */
export const claimTask = (taskId, playerId) =>
  http.post(`/task/${taskId}/claim`, { playerId })
