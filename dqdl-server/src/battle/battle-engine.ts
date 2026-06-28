import {
  EventBus,
  Combatant,
  ActiveBuff,
  Attrs,
  Ctx,
  Hook,
  BuffDef,
  EffectRow,
  AttackEvent,
  BattleState,
  SkillEffectEntry,
  nextId,
} from './battle.types';
import { Buff } from '../buff/buff.entity';
import { BuffEffect } from '../buff/buff-effect.entity';
import { buffLibrary } from './buff-library';

export const DEFS = new Map<string, BuffDef>();

export function getBuffDef(key: string): BuffDef | undefined {
  return DEFS.get(key);
}

/** 把技能配置里的 effect 条目归一化为 {buff, paramKey?, level?} 形式 */
export function normalizeEntries(arr: any[]): SkillEffectEntry[] {
  return (arr || []).map((e) => (typeof e === 'string' ? { buff: e } : { buff: e.buff, paramKey: e.paramKey, level: e.level }));
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch { return fallback; }
}

export function loadDefs(buffs: Buff[], effects: BuffEffect[]): void {
  DEFS.clear();
  const effByBuff = new Map<number, EffectRow[]>();
  for (const e of effects) {
    const row: EffectRow = {
      hook: e.hook as Hook,
      fnId: e.fnId,
      params: parseJson(e.params, {}),
      priority: e.priority ?? 0,
      consume: !!e.consume,
    };
    const list = effByBuff.get(e.buffId) || [];
    list.push(row);
    effByBuff.set(e.buffId, list);
  }
  for (const b of buffs) {
    DEFS.set(b.key, {
      id: b.id, key: b.key, name: b.name, icon: b.icon, type: b.type,
      description: b.description,
      duration: b.duration, stackRule: b.stack_rule, maxStack: b.max_stack,
      snapshot: !!b.snapshot, priority: b.priority ?? 0,
      tags: parseJson(b.tags, []),
      effects: effByBuff.get(b.id) || [],
    });
  }
}

let _uid = 0;
const nextUid = () => ++_uid;

export function createCombatant(opts: {
  side: 'player' | 'mob';
  name: string;
  level: number;
  base: Partial<Attrs>;
  hp: number;
  maxHp: number;
  energy?: number;
  maxEnergy?: number;
  skipEnergy?: boolean;
}): Combatant {
  return {
    uid: nextUid(),
    side: opts.side,
    name: opts.name,
    level: opts.level,
    base: { power: 0, intelligence: 0, quick: 0, stamina: 0, crit_rate: 20, ...opts.base },
    hp: opts.hp,
    maxHp: opts.maxHp,
    energy: opts.energy || 0,
    maxEnergy: opts.maxEnergy || 0,
    skipEnergy: !!opts.skipEnergy,
    buffs: [],
  };
}

export function getAttrs(c: Combatant): Attrs {
  const a: Attrs = { ...c.base };
  for (const ab of c.buffs) {
    const def = DEFS.get(ab.key);
    if (!def) continue;
    for (const e of def.effects) {
      if (e.hook !== 'passive' || e.fnId !== 'stat') continue;
      const v = (e.params.value || 0) * (ab.level || 1) * (ab.stacks || 1);
      const attr = e.params.attr;
      if (!attr) continue;
      if (e.params.op === 'add') a[attr] = (a[attr] || 0) + v;
      else if (e.params.op === 'mul') a[attr] = (a[attr] || 0) * (1 + v);
    }
  }
  return a;
}

export function hasStatus(c: Combatant, tag: string): boolean {
  return c.buffs.some(ab => DEFS.get(ab.key)?.tags.includes(tag));
}

export function applyBuff(
  target: Combatant,
  key: string,
  source: Combatant,
  level = 1,
  snapshotOverride?: Attrs,
  paramsOverride?: Record<string, any>,
): ActiveBuff | null {
  const def = DEFS.get(key);
  if (!def) return null;
  const existing = target.buffs.find(b => b.key === key);
  if (existing) {
    if (def.stackRule === 'refresh') { existing.remaining = def.duration; existing.level = Math.max(existing.level, level); }
    else if (def.stackRule === 'stack') { existing.stacks = Math.min(def.maxStack || 5, existing.stacks + 1); existing.remaining = def.duration; }
    if (paramsOverride) existing.params = { ...(existing.params || {}), ...paramsOverride };
    return existing;
  }
  const inst: ActiveBuff = {
    uid: nextUid(),
    key,
    buffId: def.id,
    level,
    remaining: def.duration,
    stacks: 1,
    source: source || target,
    snapshot: def.snapshot ? (snapshotOverride || getAttrs(source || target)) : null,
    consumed: false,
    params: paramsOverride,
  };
  target.buffs.push(inst);
  return inst;
}

/**
 * 把 buff 描述解析为玩家可见文案。
 * 描述定义（BuffDef.description）与动态参数（ActiveBuff.params，由技能携带派发）
 * 均归属引擎层；此处为唯一解析点，服务/前端只透传结果。
 * 占位符：{key} 原值、{key%} 百分比（0.38→38%）；缺参时百分比回退为"部分"。
 */
export function describeBuff(ab: ActiveBuff): string {
  const def = DEFS.get(ab.key);
  const tpl = def?.description || '';
  const params = ab.params;
  if (!tpl || !tpl.includes('{') || !params) return tpl;
  return tpl.replace(/\{([^{}]+?)(%?)\}/g, (_m, k: string, pct: string) => {
    const v = params[k.trim()];
    if (v == null || v === '') return pct ? '部分' : '';
    const n = Number(v);
    return pct ? (Number.isNaN(n) ? String(v) : Math.round(n * 100) + '%') : String(v);
  });
}

function tickBuffs(state: BattleState, c: Combatant) {
  for (let i = c.buffs.length - 1; i >= 0; i--) {
    const ab = c.buffs[i];
    if (ab.remaining !== Infinity) ab.remaining -= 1;
    if (ab.remaining <= 0) {
      const def = DEFS.get(ab.key);
      state.log.push(`· ${c.name} 身上「${def?.name || ab.key}」消退`);
      c.buffs.splice(i, 1);
    }
  }
}

function reapConsumed(c: Combatant) {
  c.buffs = c.buffs.filter(b => !b.consumed);
}

function checkDeath(state: BattleState, attacker: Combatant, defender: Combatant) {
  if (defender.hp <= 0 && !state.over) {
    state.over = true;
    state.winner = attacker.side;
    state.log.push(`🎉 ${defender.name} 被击败！`);
  }
}

interface Task { priority: number; fnId: string; params: any; ab: ActiveBuff | null; consume: boolean }

function dispatch(state: BattleState, unit: Combatant, hook: Hook, ctxBase: Omit<Ctx, 'self'>, extra: EffectRow[] = []) {
  const ctx: Ctx = { ...ctxBase, self: unit };
  const tasks: Task[] = [];
  for (const ab of unit.buffs) {
    const def = DEFS.get(ab.key);
    if (!def) continue;
    for (const e of def.effects) {
      if (e.hook === hook) {
        const merged = ab.params ? { ...e.params, ...ab.params } : e.params;
        tasks.push({ priority: e.priority, fnId: e.fnId, params: merged, ab, consume: e.consume });
      }
    }
  }
  for (const s of extra) {
    if (s.hook === hook) tasks.push({ priority: s.priority, fnId: s.fnId, params: s.params, ab: null, consume: s.consume });
  }
  tasks.sort((a, b) => a.priority - b.priority);
  for (const t of tasks) {
    const fn = buffLibrary[t.fnId];
    if (fn) fn(ctx, t.params, t.ab);
    if (t.consume && t.ab) t.ab.consumed = true;
  }
  for (const letter of state.bus.drain(unit, hook)) {
    if (letter.resolve) letter.resolve(ctx);
  }
}

function buildSkillSteps(skill: BattleState['skills'][number]): EffectRow[] {
  const steps: EffectRow[] = [];
  const P = skill.params || {};
  for (const entry of skill.carried || []) {
    const def = DEFS.get(entry.buff);
    if (!def) continue;
    const override = entry.paramKey ? { ratio: P[entry.paramKey] } : undefined;
    for (const e of def.effects) {
      steps.push({ ...e, params: override ? { ...e.params, ...override } : e.params });
    }
  }
  for (const entry of skill.deliver || []) {
    const override = entry.paramKey ? { ratio: P[entry.paramKey] } : undefined;
    steps.push({ hook: 'beforeAttack', fnId: 'deliver', params: { buffKey: entry.buff, level: entry.level ?? 1, ...(override || {}) }, priority: 50, consume: false });
  }
  for (const entry of skill.selfBuffs || []) {
    const override = entry.paramKey ? { amount: P[entry.paramKey] } : undefined;
    steps.push({ hook: 'beforeAttack', fnId: 'apply_self', params: { buffKey: entry.buff, level: entry.level ?? 1, ...(override || {}) }, priority: 20, consume: false });
  }
  return steps;
}

/**
 * 护盾吸收：目标身上 barrier buff（params.amount 为剩余护盾量）吸收本次伤害。
 * 护盾唯一（stack_rule=refresh，刷新即重置量与持续时间）；耗尽则立即移除。
 * 在 finalDamage 计算后、扣血前调用。
 */
function absorbShield(state: BattleState, tgt: Combatant, damage: number): number {
  if (damage <= 0) return damage;
  const barrier = tgt.buffs.find((b) => b.key === 'barrier');
  if (!barrier) return damage;
  const amt = Number(barrier.params?.amount) || 0;
  if (amt <= 0) return damage;
  const absorb = Math.min(amt, damage);
  barrier.params = { ...(barrier.params || {}), amount: amt - absorb };
  state.log.push(`🛡️ ${tgt.name} 护盾吸收 ${absorb} 伤害（剩余 ${barrier.params.amount}）`);
  if (Number(barrier.params.amount) <= 0) {
    const idx = tgt.buffs.indexOf(barrier);
    if (idx >= 0) tgt.buffs.splice(idx, 1);
    state.log.push(`🛡️ ${tgt.name} 的护盾被击破`);
  }
  return damage - absorb;
}

function runAttack(state: BattleState, src: Combatant, tgt: Combatant, skill: BattleState['skills'][number] | null) {
  state.bus.depth++;
  if (state.bus.depth > 8) { state.bus.depth--; return; }

  if (skill && !src.skipEnergy) {
    const cost = skill.energyCost || 0;
    if (src.energy < cost) { state.log.push(`⚠ ${src.name} 斗气不足，无法施放${skill.name}`); state.bus.depth--; return; }
    src.energy -= cost;
  }

  const aAttrs = getAttrs(src);
  const dAttrs = getAttrs(tgt);
  const raw = skill
    ? (aAttrs[skill.attr] || 0) * (skill.scalingRate || 1) + (skill.baseDamage || 0)
    : (aAttrs.power || 0);
  let reduction = (dAttrs.stamina + 800) / ((src.level + 20) * 100);
  reduction = Math.min(0.95, Math.max(0, reduction));

  const atk: AttackEvent = {
    source: src, target: tgt, baseDamage: 0, finalDamage: 0,
    damageMul: 1, reduction, armorPen: 0, crit: false, canceled: false, payload: {},
  };
  atk.baseDamage = Math.max(1, Math.round(raw));
  atk.crit = Math.random() * 100 < (aAttrs.crit_rate ?? 20);

  const ctxBase = { source: src, target: tgt, atk, bus: state.bus, log: state.log };

  dispatch(state, src, 'beforeAttack', ctxBase, skill ? buildSkillSteps(skill) : []);
  dispatch(state, tgt, 'beforeHit', ctxBase);

  if (atk.canceled) {
    state.log.push(`${tgt.name} 闪避了 ${src.name} 的攻击`);
  } else {
    const effReduction = Math.min(0.95, Math.max(0, atk.reduction * (1 - Math.min(0.95, atk.armorPen))));
    atk.finalDamage = Math.max(0, Math.round(atk.baseDamage * (1 - effReduction) * atk.damageMul * (atk.crit ? 2 : 1)));
    // 护盾吸收（在 finalDamage 计算后、扣血前）
    atk.finalDamage = absorbShield(state, tgt, atk.finalDamage);
    const before = tgt.hp;
    tgt.hp = Math.max(0, tgt.hp - atk.finalDamage);
    state.log.push(`${atk.crit ? '⚡暴击！' : ''}${src.name}${skill ? ` 「${skill.name}」` : ''} → ${tgt.name} ${before - tgt.hp} 伤害`);
    state.bus.eventLog.push({ t: 'damage', from: src.name, to: tgt.name, amount: atk.finalDamage, crit: atk.crit });
    checkDeath(state, src, tgt);
    if (!state.over) { dispatch(state, tgt, 'afterHit', ctxBase); checkDeath(state, src, tgt); checkDeath(state, tgt, src); }
    if (!state.over) { dispatch(state, src, 'afterAttack', ctxBase); checkDeath(state, src, tgt); }
  }
  state.bus.depth--;
}

export function runTurn(state: BattleState, attacker: Combatant, defender: Combatant, action: { type: 'normal' | 'skill'; skill?: BattleState['skills'][number] }) {
  if (state.over) return;
  const ctxBase = { source: attacker, target: defender, atk: null as AttackEvent | null, bus: state.bus, log: state.log };

  dispatch(state, attacker, 'onTurnStart', ctxBase);
  // 持续伤害（中毒/流血）可能在 onTurnStart 扣血致死；DoT 由对面施加，winner 归对面
  checkDeath(state, defender, attacker);
  if (state.over) return;
  tickBuffs(state, attacker);

  if (hasStatus(attacker, 'stun')) { state.log.push(`💫 ${attacker.name} 被眩晕，跳过回合`); return; }

  runAttack(state, attacker, defender, action.type === 'skill' ? action.skill || null : null);

  dispatch(state, attacker, 'onTurnEnd', ctxBase);
  // onTurnEnd 持续伤害同样可能致死
  checkDeath(state, defender, attacker);
  reapConsumed(attacker);
  checkDeath(state, attacker, defender);
}

export function newState(player: Combatant, mob: Combatant, skills: BattleState['skills']): BattleState {
  return { player, mob, bus: new EventBus(), log: [], over: false, winner: null, skills };
}
