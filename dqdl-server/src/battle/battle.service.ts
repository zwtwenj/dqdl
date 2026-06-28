import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PlayerService } from '../player/player.service';
import { MobService } from '../mob/mob.service';
import { BuffService } from '../buff/buff.service';
import { SkillService } from '../skill/skill.service';
import {
  createCombatant,
  newState,
  runTurn,
  loadDefs,
  getBuffDef,
  describeBuff,
  applyBuff,
  normalizeEntries,
} from './battle-engine';
import { BattleState, ResolvedSkill } from './battle.types';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch { return fallback; }
}

/**
 * 快速战斗分档：根据双方总属性比给出胜率与叙事风格。
 * 源自原 training.service.ts 的内联胜率阶梯，搬入 battle 模块以统一战斗结算。
 */
export function classifyQuickBattle(
  playerTotal: number,
  mobTotal: number,
): { ratio: number; winRate: number; style: string } {
  const ratio = mobTotal > 0 ? mobTotal / playerTotal : 0;
  let winRate: number;
  let style: string;
  if (ratio < 0.5) {
    winRate = 100; style = '随手斩杀';
  } else if (ratio < 0.8) {
    winRate = 75; style = '轻松获胜';
  } else if (ratio < 1.0) {
    winRate = 50; style = '势均力敌';
  } else if (ratio < 1.5) {
    winRate = 25; style = '艰难苦战';
  } else if (ratio <= 2) {
    winRate = 10; style = '九死一生';
  } else {
    winRate = 0; style = '毫无胜算';
  }
  return { ratio, winRate, style };
}

export interface BuffSnapshot { icon: string; name: string; desc: string; remaining: number | string; stacks: number }
export interface SideSnapshot {
  name: string; level: number;
  hp: number; maxHp: number; energy: number; maxEnergy: number;
  buffs: BuffSnapshot[];
}
export interface BattleSnapshot {
  player: SideSnapshot;
  mob: SideSnapshot;
  over: boolean;
  winner: string | null;
  log: string[];
  eventLog: any[];
  skills: { id: number; name: string; energyCost: number; attr: string }[];
}

/**
 * 回合制战斗运行时服务：会话管理、回合调度、快照。
 *
 * 阶段 1.2/1.5 重构后：
 *  - 不再直接注入 Buff/BuffEffect/Skill 的 Repository，改走 BuffService / SkillService
 *  - seed / DDL / 种子常量 / 全员重置斗技 等管理员工具移至 BattleSeeder（见 battle.seed.ts）
 *  - 快速战斗结算（历练用）统一由 resolveQuickBattle 提供
 */
@Injectable()
export class BattleService implements OnModuleInit {
  private readonly logger = new Logger(BattleService.name);
  private readonly sessions = new Map<number, BattleState>();

  constructor(
    private readonly buffService: BuffService,
    private readonly skillService: SkillService,
    private readonly playerService: PlayerService,
    private readonly mobService: MobService,
  ) {}

  async onModuleInit() {
    await this.reloadDefs();
  }

  async reloadDefs() {
    const [buffs, effects] = await Promise.all([this.buffService.findAll(), this.buffService.findAllEffects()]);
    loadDefs(buffs, effects);
    this.logger.log(`已加载 ${buffs.length} 个 buff 定义 / ${effects.length} 条效果`);
  }

  /** 总属性 = 力量+智力+敏捷+体质 */
  private totalAttrs(attrs: { power: number; intelligence: number; quick: number; stamina: number }): number {
    return attrs.power + attrs.intelligence + attrs.quick + attrs.stamina;
  }

  /**
   * 快速战斗结算（用于历练）：按双方总属性比分档胜率，掷骰判定胜负。
   * 取代原本散落在 training.service 的重复战斗算法。
   */
  resolveQuickBattle(playerData: any, mob: { power: number; intelligence: number; quick: number; stamina: number }): {
    winRate: number; style: string; won: boolean; playerTotal: number; mobTotal: number; rounds: number;
  } {
    const playerTotal = this.totalAttrs({
      power: playerData.final_attrs?.power ?? playerData.power,
      intelligence: playerData.final_attrs?.intelligence ?? playerData.intelligence,
      quick: playerData.final_attrs?.quick ?? playerData.quick,
      stamina: playerData.final_attrs?.stamina ?? playerData.stamina,
    });
    const mobTotal = this.totalAttrs({
      power: mob.power, intelligence: mob.intelligence, quick: mob.quick, stamina: mob.stamina,
    });
    const { winRate, style } = classifyQuickBattle(playerTotal, mobTotal);
    const won = Math.random() * 100 < winRate;
    return { winRate, style, won, playerTotal, mobTotal, rounds: 1 };
  }

  async start(playerId: number, mobId: string): Promise<BattleSnapshot> {
    const playerData: any = await this.playerService.findOne(playerId);
    if (!playerData) throw new Error('玩家不存在');
    const mobData = await this.mobService.findByMobId(mobId);
    if (!mobData) throw new Error('怪物不存在');

    const attrs = playerData.final_attrs || {};
    const player = createCombatant({
      side: 'player',
      name: playerData.name || '勇者',
      level: playerData.level || 1,
      base: { power: attrs.power || 0, intelligence: attrs.intelligence || 0, quick: attrs.quick || 0, stamina: attrs.stamina || 0, crit_rate: 20 },
      hp: playerData.hp || 0,
      maxHp: attrs.max_hp || playerData.max_hp || 100,
      energy: playerData.energy || 0,
      maxEnergy: attrs.max_energy || playerData.max_energy || 100,
      skipEnergy: false,
    });
    const mob = createCombatant({
      side: 'mob',
      name: mobData.name || '???',
      level: mobData.level || 1,
      base: { power: mobData.power || 0, intelligence: mobData.intelligence || 0, quick: mobData.quick || 0, stamina: mobData.stamina || 0, crit_rate: 20 },
      hp: (mobData as any).hp || 100,
      maxHp: (mobData as any).hp || 100,
      skipEnergy: true,
    });

    const skills = await this.resolveSkills(playerData.skill);
    const state = newState(player, mob, skills);

    // 注入待生效战斗 buff（由可使用物品登记在 player.buff）
    const pending = parseJson<any[]>(playerData.buff, []);
    if (Array.isArray(pending) && pending.length) {
      for (const entry of pending) {
        if (entry && entry.buff && getBuffDef(entry.buff)) {
          applyBuff(player, entry.buff, player, Number(entry.level) || 1);
          state.log.push(`💊 战前增益「${getBuffDef(entry.buff)?.name || entry.buff}」生效`);
        }
      }
      await this.playerService.patch(playerId, { buff: '[]' });
    }

    this.sessions.set(playerId, state);
    return this.snapshot(state);
  }

  async action(playerId: number, body: { type: 'normal' | 'skill' | 'flee'; slot?: number }): Promise<BattleSnapshot> {
    const state = this.sessions.get(playerId);
    if (!state) throw new Error('战斗未开始，请先 /battle/start');
    if (state.over) return this.snapshot(state);

    if (body.type === 'flee') {
      state.log.push('🏃 你逃离了战斗');
      state.over = true;
      await this.persist(playerId, state);
      return this.snapshot(state);
    }

    const action = body.type === 'skill' && body.slot != null
      ? { type: 'skill' as const, skill: state.skills[body.slot] }
      : { type: 'normal' as const };

    runTurn(state, state.player, state.mob, action);
    if (!state.over && state.mob.hp > 0) {
      runTurn(state, state.mob, state.player, { type: 'normal' });
    }
    await this.persist(playerId, state);
    return this.snapshot(state);
  }

  getState(playerId: number): BattleSnapshot | null {
    const state = this.sessions.get(playerId);
    return state ? this.snapshot(state) : null;
  }

  private async persist(playerId: number, state: BattleState) {
    await this.playerService.patch(playerId, {
      hp: Math.max(0, state.player.hp),
      energy: Math.max(0, state.player.energy),
    });
  }

  private async resolveSkills(raw: string | null): Promise<ResolvedSkill[]> {
    const equipped = parseJson<any[]>(raw, []).filter(s => s && s.carry >= 1 && s.carry <= 5).sort((a, b) => a.carry - b.carry);
    if (!equipped.length) return [];
    const ids = [...new Set(equipped.map(s => s.id))];
    const defs = await this.skillService.findByIds(ids);
    const defMap = new Map(defs.map(d => [d.id, d]));
    return equipped.map(s => {
      const def = defMap.get(s.id);
      const levelsArr = parseJson<any[]>(def?.levels, []);
      const lvEntry = levelsArr.find(l => l && l.level === s.level) || levelsArr[levelsArr.length - 1] || {};
      const params: Record<string, number> = lvEntry.params || {};
      const scalingRate = params.damageRate ?? 1;
      return {
        id: s.id,
        name: def?.name || '未知斗技',
        attr: def?.attr || 'power',
        scalingRate,
        baseDamage: def?.base_damage || 0,
        energyCost: def?.energy_cost || 0,
        params,
        carried: normalizeEntries(parseJson<any[]>(def?.carried, [])),
        deliver: normalizeEntries(parseJson<any[]>(def?.target_effects, [])),
        selfBuffs: normalizeEntries(parseJson<any[]>(def?.self_effects, [])),
      };
    });
  }

  private snapshot(state: BattleState): BattleSnapshot {
    return {
      player: this.sideSnap(state.player),
      mob: this.sideSnap(state.mob),
      over: state.over,
      winner: state.winner,
      log: state.log.slice(-50),
      eventLog: state.bus.eventLog,
      skills: state.skills.map(s => ({ id: s.id, name: s.name, energyCost: s.energyCost, attr: s.attr })),
    };
  }

  private sideSnap(c: BattleState['player']): SideSnapshot {
    return {
      name: c.name, level: c.level,
      hp: c.hp, maxHp: c.maxHp, energy: c.energy, maxEnergy: c.maxEnergy,
      buffs: c.buffs.map(ab => {
        const def = getBuffDef(ab.key);
        return {
          icon: def?.icon || '◇',
          name: def?.name || ab.key,
          desc: describeBuff(ab),
          remaining: ab.remaining === Infinity ? '∞' : ab.remaining,
          stacks: ab.stacks,
        };
      }),
    };
  }
}
