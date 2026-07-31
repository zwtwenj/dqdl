import http from './request'

/**
 * 任务接口（对应后端 /api/task/*）。
 *
 * 四态状态机：draft（草稿）→ pending（进行中）→ claimed（已领奖）/ delete（删除）。
 * preview 落库 draft 返回 taskId，前端用 taskId 拉单条详情，全程不传任务内容（防篡改）。
 */

/** 预览佣兵任务（生成草稿 draft 落库）→ { ok, taskId?, msg? }
 *  npcId/npcName 可选：发布人 NPC 信息，用于记录任务的 giver（发布人快照） */
export const previewAdventurerTask = (playerId, npcId, npcName) =>
  http.post('/task/adventurer/preview', { playerId, npcId, npcName })

/** 接受草稿任务（draft → pending）→ { ok, taskId?, msg? } */
export const acceptAdventurerTask = (playerId, taskId) =>
  http.post('/task/adventurer/accept', { playerId, taskId })

/** 拒绝/换一个草稿任务（draft → delete）→ { ok, msg? } */
export const rejectTask = (playerId, taskId) =>
  http.post('/task/adventurer/reject', { playerId, taskId })

/** 查我的进行中任务（pending）→ Task[] */
export const getMyTasks = (playerId) => http.get(`/task/mine/${playerId}`)

/** 查单条任务详情（draft/pending 都能查，校验归属）→ Task | null */
export const getTask = (taskId) => http.get(`/task/${taskId}`)

/** 交付任务领奖 → { money } */
export const claimTask = (taskId, playerId) =>
  http.post(`/task/${taskId}/claim`, { playerId })

/** 放弃任务（pending/claimed → abandoned）→ { ok, msg? } */
export const abandonTask = (taskId, playerId) =>
  http.post(`/task/${taskId}/abandon`, { playerId })
