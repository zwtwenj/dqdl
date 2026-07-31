/**
 * 丹药效果注册表（数据驱动）。
 *
 * pill.effect 存 JSON，格式为 key→参数 的映射，每个 key 对应一个效果处理函数。
 * 支持单效果或多效果叠加：
 *   { "heal_hp": 30 }                                  单效果
 *   { "heal_hp": 30, "heal_energy": 20 }               多效果叠加
 *   { "addAttr": { "power": 5 } }                      参数为对象
 *   { "addBuff": { "key": "qingxin_t1", "scope": "next_battle" } }
 *
 * applyEffects 遍历 JSON 每个 key，调对应 handler 累积 patch（写回 player）。
 * 未知 key 抛错，保证配置可控。
 */
import { Biz } from '../common/biz.exception';

/** 玩家原始字段（patch 读写用） */
interface RawPlayer {
  hp: number;
  energy: number;
  cultivation: number;
  level_cultivation: number;
  breakthrough_bonus: number;
  buff: string | null;
  base_power: number;
  base_intelligence: number;
  base_quick: number;
  base_stamina: number;
  base_lucky: number;
  [k: string]: any;
}

/** 效果处理函数签名：(玩家, 参数, 上限) → 要写回的 patch */
type EffectHandler = (
  player: RawPlayer,
  params: any,
  max: { maxHp: number; maxEnergy: number },
) => Record<string, any>;

/** 加属性白名单 → base_ 字段名映射 */
const ATTR_BASE_FIELD: Record<string, string> = {
  power: 'base_power',
  intelligence: 'base_intelligence',
  quick: 'base_quick',
  stamina: 'base_stamina',
  lucky: 'base_lucky',
};

// key → 效果处理函数（受信任代码）
export const effectHandlers: Record<string, EffectHandler> = {
  /** 回生命：hp = min(maxHp, hp + n) */
  heal_hp: (p, params, max) => {
    const n = Number(params) || 0;
    return { hp: Math.min(max.maxHp, p.hp + n) };
  },
  /** 回斗气：energy = min(maxEnergy, energy + n) */
  heal_energy: (p, params, max) => {
    const n = Number(params) || 0;
    return { energy: Math.min(max.maxEnergy, p.energy + n) };
  },
  /** 加修为：cultivation = min(等级修为上限, cultivation + n) */
  gain_cultivation: (p, params) => {
    const n = Number(params) || 0;
    const cap = Number(p.level_cultivation) || 0;
    const before = Number(p.cultivation) || 0;
    return { cultivation: cap > 0 ? Math.min(cap, before + n) : before + n };
  },
  /** 加突破成功率：breakthrough_bonus += n */
  add_breakthrough_bonus: (p, params) => {
    const n = Number(params) || 0;
    return { breakthrough_bonus: (Number(p.breakthrough_bonus) || 0) + n };
  },
  /** 加五维属性（永久）：参数 {power:5, quick:3,...}，写 base_* 字段 */
  addAttr: (p, params) => {
    const patch: Record<string, any> = {};
    const obj = params && typeof params === 'object' ? params : {};
    for (const attr of Object.keys(obj)) {
      const field = ATTR_BASE_FIELD[attr];
      if (!field) throw Biz.badRequest(`未知属性: ${attr}`);
      const n = Number(obj[attr]) || 0;
      patch[field] = (Number(p[field]) || 0) + n;
    }
    return patch;
  },
  /** 加战斗 buff：参数 {key, scope}。登记到 player.buff（JSON 数组）。
   *  注：战斗引擎消费 buff 的逻辑本轮未接入，登记后暂无实际战斗效果。 */
  addBuff: (p, params) => {
    const obj = params && typeof params === 'object' ? params : {};
    if (!obj.key) throw Biz.badRequest('addBuff 缺少 key');
    let list: any[] = [];
    try {
      const v = JSON.parse(p.buff || '[]');
      if (Array.isArray(v)) list = v;
    } catch {
      list = [];
    }
    list.push({ key: obj.key, scope: obj.scope || 'next_battle' });
    return { buff: JSON.stringify(list) };
  },
};

/**
 * 遍历效果 JSON，按 key 调对应 handler，累积合并 patch 返回。
 * @param effect 效果 JSON 对象（pill.effect 解析结果）
 * @returns 合并后的 patch（调方写回 player）
 */
export function applyEffects(
  player: RawPlayer,
  effect: Record<string, any> | null,
  max: { maxHp: number; maxEnergy: number },
): Record<string, any> {
  if (!effect || typeof effect !== 'object') {
    throw Biz.badRequest('丹药效果配置无效');
  }
  const merged: Record<string, any> = {};
  for (const key of Object.keys(effect)) {
    const handler = effectHandlers[key];
    if (!handler) throw Biz.badRequest(`未知丹药效果: ${key}`);
    const patch = handler(player, effect[key], max);
    Object.assign(merged, patch);
  }
  return merged;
}
