/**
 * 剧本模块的常量定义（独立文件，无依赖）。
 *
 * 之所以单独抽出：SCRIPT_HOOK_EVENT 被 5 个业务 service（player/location_net/...）
 * import 来 emit 事件，而 ScriptTriggerService 又反向依赖这些业务 service 的模块
 * （如 PlayerService）。若常量定义在 script-trigger.service.ts，会形成模块级循环加载
 * （player.service → script-trigger.service → ... → player.service），导致 NestJS 依赖
 * 注入时 PlayerService 在 ScriptModule 上下文中 undefined。
 *
 * 把常量放这里，业务 service 只依赖这个无依赖的常量文件，打破循环。
 */

/** 统一钩子事件名：5 个游戏钩子（突破/进入场景/...）都 emit 这个事件。 */
export const SCRIPT_HOOK_EVENT = 'script.hook';

/** SSE 推送的剧本触发事件名（通用 event 通道，前端按此分发）。 */
export const SCRIPT_TRIGGER_EVENT = 'script_trigger';
