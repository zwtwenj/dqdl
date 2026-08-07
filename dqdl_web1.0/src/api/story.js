import http from './request'

/**
 * 故事事件接口。
 *
 * 约定：同一时间一个玩家只能触发一个事件（后端 StoryService 保证）。
 * 玩家进入游戏/页面刷新时调 getCurrentStoryEvent() 一次：
 *   - 无进行中事件 → { ok: true, event: null }
 *   - 有 → { ok: true, event: { instance_id, event_id, story_id, title,
 *                               current_node, node, node_path, status } }
 *         node 为当前节点完整数据（含 text/choices/action），
 *         action.kind ∈ battle/move/reward —— 前端据此触发对应游戏动作。
 */
export const getCurrentStoryEvent = () =>
  http.get('/story/current')
