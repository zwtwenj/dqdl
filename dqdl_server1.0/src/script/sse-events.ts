/**
 * SSE 事件名统一常量表（通用事件通道的唯一事件名注册中心）。
 *
 * 设计背景：
 *   所有业务模块经 ScriptSseService.push(playerId, event, data) 推送事件，
 *   事件名若散落裸字符串，前端 sseEventHandlers 与后端 push 容易不同步。
 *   这里集中定义，业务模块一律用常量引用，杜绝拼写漂移。
 *
 * 独立无依赖文件（与 script.constants.ts 同理），避免模块循环加载。
 * 前端对应注册表：dqdl_web1.0/src/utils/sseEventHandlers.js（事件名需与此一致）。
 */
export const SseEvents = {
  // ── 剧本演出 ──
  SCRIPT_TRIGGER: 'script_trigger',

  // ── 任务 ──
  TASK_UPDATE: 'task_update',

  // ── 历练 ──
  TRAINING_LOG: 'training_log',
  TRAINING_FINISHED: 'training_finished',

  // ── 修炼（洞天福地）──
  CULTIVATION_START: 'cultivation_start',
  CULTIVATION_SETTLE: 'cultivation_settle',
  CULTIVATION_FINISHED: 'cultivation_finished',

  // ── 移动 ──
  MOVE_ARRIVED: 'move_arrived',
  MOVE_FINISHED: 'move_finished',
  MOVE_CANCELLED: 'move_cancelled',

  // ── 故事事件（story_event，运行时推进节点：battle/move/reward 原子化动作）──
  STORY_EVENT: 'story_event',
} as const;

/** 所有已注册的 SSE 事件名（调试/校验用）。 */
export const SSE_EVENT_NAMES: readonly string[] = Object.values(SseEvents);
