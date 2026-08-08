/**
 * 故事事件触发函数库（纯函数，无 Nest 依赖，可单测）。
 *
 * 触发配置结构（story_event.trigger_config，配置页 EventTriggers 输出）：
 *   {
 *     trigger: 'enter_map' | 'complete_task' | 'defeat_enemy' | 'use_item',
 *     params: {
 *       player:       { level: { symbol, value }, money: { symbol, value } },
 *       location_net: { location_type: { value: ['wild'] } },
 *     },
 *     probability: 0-100,
 *   }
 *
 * 求值约定：
 *   - params.player.<字段>      → 数字比较（symbol: > < = >= <=，缺省按 =）
 *   - params.location_net.location_type.value（数组）→ 包含当前钩子上下文的 loc_type 即通过
 *   - probability < 100 时按概率随机放行
 */

/** 符号比较（> < = >= <=，缺省按 =） */
export function compareValue(value: number, symbol: string | undefined, threshold: number): boolean {
  switch (symbol) {
    case '>':
      return value > threshold;
    case '<':
      return value < threshold;
    case '>=':
      return value >= threshold;
    case '<=':
      return value <= threshold;
    default:
      return value === threshold;
  }
}

/** 玩家字段条件（params.player.*） */
function checkPlayerParams(params: any, player: any): boolean {
  const fields = params?.player;
  if (!fields) return true;
  for (const key of Object.keys(fields)) {
    const cond = fields[key];
    const actual = player?.[key];
    if (actual == null) return false;
    if (!compareValue(Number(actual), cond?.symbol, Number(cond?.value))) return false;
  }
  return true;
}

/** 地图类条件（params.location_net.location_type 多选，包含钩子上下文 loc_type 即通过） */
function checkLocationNet(params: any, ctx: any): boolean {
  const ln = params?.location_net;
  if (!ln?.location_type) return true;
  const allowed: string[] = ln.location_type.value || [];
  if (!allowed.length) return true;
  return allowed.includes(ctx?.location?.loc_type);
}

/**
 * 求值整条触发配置：params 全部通过 + 概率放行。
 * @param config 触发配置 { trigger, params, probability }
 * @param player 玩家快照 { level, money, status, ... }
 * @param ctx    钩子上下文 { location?: { id, name, loc_type } }
 */
export function evaluateTriggerConfig(config: any, player: any, ctx: any): boolean {
  if (!config) return false;
  if (!checkPlayerParams(config.params, player)) return false;
  if (!checkLocationNet(config.params, ctx)) return false;
  const prob = Number(config.probability ?? 100);
  if (prob <= 0) return false;
  if (prob < 100 && Math.random() * 100 >= prob) return false;
  return true;
}
