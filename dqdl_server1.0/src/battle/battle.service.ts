import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayerService, PLAYER_STATUS } from '../player/player.service';
import { MobService } from '../mob/mob.service';
import { BuffService } from '../buff/buff.service';
import { SkillService } from '../skill/skill.service';
import { BattleLog } from './battle-log.entity';
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
import { Biz } from '../common/biz.exception';

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch { return fallback; }
}

/** 安全序列化：战斗 Combatant 的 buff.source 引用会形成循环（source→Combatant），
 *  持久化到 battle_log 时跳过 source 字段，避免 JSON.stringify 循环引用崩溃。 */
function safeStringify(obj: any): string | null {
  if (obj == null) return null;
  const seen = new WeakSet<object>();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      // 循环引用字段（buff.source 等指向 Combatant）→ 丢弃
      if (seen.has(value)) return undefined;
      if (key === 'source' || key === 'target') return undefined;
      seen.add(value);
    }
    return value;
  });
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
  /** 本回合新增的日志（最后一次 action 后追加的条目）；前端只滚动这部分 */
  round: number;
  log: string[];
  skills: { id: number; name: string; itemId: string | null; energyCost: number; attr: string }[];
}

/**
 * 回合制战斗运行时服务：会话管理、回合调度、快照、战报落库。
 *
 * 会话存内存（sessions Map），战斗状态不持久化（与老版一致）。
 * 战斗结束时自动写一行 battle_log。
 *
 * 原子化入口：start(playerId, mobId) 任何模块只需传入 player + mobId 即可发起战斗；
 * 引擎层（battle-engine）完全独立，createCombatant 可接收任意属性数据，不绑定 player/mob 表。
 */
@Injectable()
export class BattleService implements OnModuleInit {
  private readonly logger = new Logger(BattleService.name);
  private readonly sessions = new Map<number, { state: BattleState; startedAt: Date; rounds: number; mobId: string; fromStatus: number; logId: number | null }>();

  constructor(
    private readonly buffService: BuffService,
    private readonly skillService: SkillService,
    private readonly playerService: PlayerService,
    private readonly mobService: MobService,
    @InjectRepository(BattleLog)
    private readonly battleLogRepo: Repository<BattleLog>,
  ) {}

  async onModuleInit() {
    await this.reloadDefs();
  }

  async reloadDefs() {
    const [buffs, effects] = await Promise.all([this.buffService.findAll(), this.buffService.findAllEffects()]);
    loadDefs(buffs, effects);
    this.logger.log(`已加载 ${buffs.length} 个 buff 定义 / ${effects.length} 条效果`);
  }

  /**
   * 开战：查 player.findOne 拿 final_attrs+skills，查 mob，createCombatant，建会话。
   * 要求玩家空闲（status=1）或秘境中（status=3，供秘境战斗复用）。
   * 战斗中作为叠加状态：status 保持来源，active_status=7（finish 清 active_status）。
   */
  async start(playerId: number, mobId: string): Promise<BattleSnapshot> {
    // 同一玩家已有进行中战斗 → 直接返回当前快照（防重复开战）
    const existing = this.sessions.get(playerId);
    if (existing && !existing.state.over) return this.snapshot(existing);
    // 内存无但库里有 active 战斗（刷新/关弹窗后内存清空）→ 还原，不重复开战
    const activeLog = await this.battleLogRepo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { id: 'DESC' },
    });
    if (activeLog) {
      const restored = await this.restoreFromLog(playerId, activeLog);
      if (restored) return restored;
    }

    const playerEntity = await this.playerService.getEntity(playerId);
    if (!playerEntity) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    // 仅允许空闲或秘境中开战（秘境战斗复用本服务）
    const fromStatus =
      playerEntity.status === PLAYER_STATUS.DUNGEON
        ? PLAYER_STATUS.DUNGEON
        : PLAYER_STATUS.IDLE;
    if (playerEntity.status !== PLAYER_STATUS.IDLE && playerEntity.status !== PLAYER_STATUS.DUNGEON) {
      throw Biz.conflict('当前状态无法开战，请先结束其它活动');
    }

    const playerData: any = await this.playerService.findOne(playerId);
    const mobData = await this.mobService.findByMobId(mobId);
    if (!mobData) throw Biz.notFound(`怪物 ${mobId} 不存在`);

    const attrs = playerData.final_attrs || {};
    // 怪物 HP 推导：mob 表无 hp 字段，按 player 同款公式 stamina*10
    const mobMaxHp = (mobData.stamina || 5) * 10;

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
      hp: mobMaxHp,
      maxHp: mobMaxHp,
      skipEnergy: true,
    });

    const skills = await this.resolveSkills(playerData.skill);
    const state = newState(player, mob, skills);

    // 战斗中作为叠加状态：status 保持来源（秘境中/空闲），active_status=7
    await this.playerService.setActiveStatus(playerId, PLAYER_STATUS.BATTLE);
    // 战斗开始即写 battle_log（status=active，存玩家/怪快照，供还原）
    const logRow = await this.battleLogRepo.save(
      this.battleLogRepo.create({
        player_id: playerId,
        mob_id: mobId,
        mob_name: state.mob.name,
        result: '',
        status: 'active',
        player_state: safeStringify({ ...state.player, _skills: state.skills }),
        mob_state: JSON.stringify(state.mob),
        from_status: fromStatus,
        rounds: 0,
        log: JSON.stringify(state.log),
        player_hp: state.player.hp,
        mob_hp: state.mob.hp,
        started_at: new Date(),
      }),
    );
    this.sessions.set(playerId, { state, startedAt: new Date(), rounds: 0, mobId, fromStatus, logId: logRow.id });
    return this.snapshot(this.sessions.get(playerId)!);
  }

  /**
   * 玩家行动：玩家行动 + 怪物反击，持久化 hp/energy。
   * action.type: normal(普攻) / skill(斗技, slot=0~4 对应 carry1~5) / flee(逃跑)。
   */
  async action(playerId: number, body: { type: 'normal' | 'skill' | 'flee'; slot?: number }): Promise<BattleSnapshot> {
    const session = this.sessions.get(playerId);
    if (!session) throw Biz.conflict('战斗未开始');
    const { state } = session;
    if (state.over) return this.snapshot(session);

    if (body.type === 'flee') {
      state.log.push('🏃 你逃离了战斗');
      await this.finish(playerId, 'flee');
      return this.snapshot(session);
    }

    // 每回合记日志起点，供前端增量渲染
    session.rounds += 1;

    const action =
      body.type === 'skill' && body.slot != null
        ? { type: 'skill' as const, skill: state.skills[body.slot] }
        : { type: 'normal' as const };

    runTurn(state, state.player, state.mob, action);
    if (!state.over && state.mob.hp > 0) {
      runTurn(state, state.mob, state.player, { type: 'normal' });
    }

    // 持久化玩家 hp/energy（怪物不入库）
    await this.playerService.patch(playerId, {
      hp: Math.max(0, state.player.hp),
      energy: Math.max(0, state.player.energy),
    });

    // 每回合更新 battle_log（玩家/怪快照 + 日志 + 回合数，供刷新还原）
    if (session.logId) {
      await this.battleLogRepo.update(
        { id: session.logId },
        {
          player_state: safeStringify(state.player),
          mob_state: safeStringify(state.mob),
          log: JSON.stringify(state.log),
          rounds: session.rounds,
          player_hp: state.player.hp,
          mob_hp: state.mob.hp,
        },
      );
    }

    if (state.over) {
      await this.finish(playerId, state.winner === 'player' ? 'win' : 'lose');
    }
    return this.snapshot(session);
  }

  /** 逃跑：直接结束战斗（status 恢复 IDLE，记 flee 日志） */
  async flee(playerId: number): Promise<BattleSnapshot> {
    const session = this.sessions.get(playerId);
    if (!session) throw Biz.conflict('战斗未开始');
    if (!session.state.over) {
      session.state.log.push('🏃 你逃离了战斗');
      await this.finish(playerId, 'flee');
    }
    return this.snapshot(session);
  }

  async getState(playerId: number): Promise<BattleSnapshot | null> {
    // 内存会话优先
    const session = this.sessions.get(playerId);
    if (session) return this.snapshot(session);
    // 内存无 → 查库还原进行中的战斗（battle_log active 行）
    const log = await this.battleLogRepo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { id: 'DESC' },
    });
    if (!log) return null;
    return this.restoreFromLog(playerId, log);
  }

  /** 从 battle_log active 行还原战斗：反序列化快照 + 重建内存会话 */
  private async restoreFromLog(
    playerId: number,
    log: BattleLog,
  ): Promise<BattleSnapshot | null> {
    try {
      const playerRaw = JSON.parse(log.player_state || 'null');
      const mob = JSON.parse(log.mob_state || 'null');
      const logArr = JSON.parse(log.log || '[]');
      if (!playerRaw || !mob) return null;
      const skills = playerRaw._skills || [];
      const player = { ...playerRaw };
      delete player._skills;
      // 用 newState 重建完整 state（含 bus 事件总线等引擎内部字段），
      // 再覆盖还原的 log/over/skills。bus 是回合内事件总线（未持久化），重建空总线即可继续战斗。
      const restored: any = {
        state: {
          ...newState(player, mob, skills),
          log: Array.isArray(logArr) ? logArr : [],
          over: false,
          winner: null,
        },
        rounds: log.rounds || 0,
      };
      // 重建内存会话，后续 action 继续走内存
      this.sessions.set(playerId, {
        state: restored.state,
        startedAt: log.started_at || new Date(),
        rounds: restored.rounds,
        mobId: log.mob_id || '',
        fromStatus: log.from_status || 1,
        logId: log.id,
      });
      // 还原战斗时同步 active_status（防止后端重启后 active_status 与 battle_log 不同步）
      const p = await this.playerService.getEntity(playerId);
      if (p && p.active_status !== PLAYER_STATUS.BATTLE) {
        await this.playerService.setActiveStatus(playerId, PLAYER_STATUS.BATTLE);
      }
      return this.snapshot(restored);
    } catch (e) {
      this.logger.warn(`战斗还原失败 player=${playerId}: ${e}`);
      return null;
    }
  }

  /**
   * 恢复或清理战斗状态（页面刷新后调用）。
   * - 会话还在（未结束）→ 返回当前快照，前端无缝接回战斗界面
   * - 会话还在但已结束 → 清会话 + 恢复 IDLE + 返回快照（前端展示结果后关闭）
   * - 会话不在但玩家 status=BATTLE（后端重启导致孤儿状态）→ 恢复 IDLE，返回 null
   * - 会话不在且非战斗态 → 返回 null
   */
  async resumeOrClean(playerId: number): Promise<BattleSnapshot | null> {
    const session = this.sessions.get(playerId);
    if (session) {
      if (session.state.over) {
        // 已结束但会话未清（finish 之外的路径），补清理：清叠加状态（status 保持来源）
        await this.playerService.setActiveStatus(playerId, 0);
        this.sessions.delete(playerId);
      }
      return this.snapshot(session);
    }
    // 无会话：若是孤儿战斗叠加态（后端重启），清叠加状态（status 保持来源）
    const player = await this.playerService.getEntity(playerId);
    if (player && player.active_status === PLAYER_STATUS.BATTLE) {
      await this.playerService.setActiveStatus(playerId, 0);
    }
    return null;
  }

  /** 战斗结束：清叠加状态（status 保持来源）+ 标 battle_log finished + 清会话 */
  private async finish(playerId: number, result: 'win' | 'lose' | 'flee') {
    const session = this.sessions.get(playerId);
    if (!session) return;
    session.state.over = true;
    // 清叠加状态：status 在开战时未动（保持来源=秘境中/空闲），战斗结束只需清 active_status
    await this.playerService.setActiveStatus(playerId, 0);

    // 更新进行中的 battle_log 为 finished + 补填结果
    if (session.logId) {
      await this.battleLogRepo.update(
        { id: session.logId },
        {
          result,
          status: 'finished',
          rounds: session.rounds,
          log: session.state.log.join('\n'),
          player_state: safeStringify(session.state.player),
          mob_state: safeStringify(session.state.mob),
          player_hp: session.state.player.hp,
          mob_hp: session.state.mob.hp,
          ended_at: new Date(),
        },
      );
    }

    this.sessions.delete(playerId);
    this.logger.log(`玩家 ${playerId} 战斗结束：${result}，${session.rounds} 回合`);
  }

  /** 解析玩家已装备斗技为引擎可用的 ResolvedSkill */
  private async resolveSkills(raw: string | null): Promise<ResolvedSkill[]> {
    const equipped = parseJson<any[]>(raw, [])
      .filter((s) => s && s.carry >= 1 && s.carry <= 5)
      .sort((a, b) => a.carry - b.carry);
    if (!equipped.length) return [];
    const ids = [...new Set(equipped.map((s) => s.id))];
    const defs = await this.skillService.findByIds(ids);
    const defMap = new Map(defs.map((d) => [d.id, d]));
    return equipped.map((s) => {
      const def = defMap.get(s.id);
      const levelsArr = parseJson<any[]>(def?.levels, []);
      const lvEntry = levelsArr.find((l) => l && l.level === s.level) || levelsArr[levelsArr.length - 1] || {};
      const params: Record<string, number> = lvEntry.params || {};
      const scalingRate = params.damageRate ?? 1;
      return {
        id: s.id,
        name: def?.name || '未知斗技',
        attr: def?.attr || 'power',
        scalingRate,
        baseDamage: def?.base_damage || 0,
        energyCost: def?.energy_cost || 0,
        itemId: def?.item_id || null,
        params,
        carried: normalizeEntries(parseJson<any[]>(def?.carried, [])),
        deliver: normalizeEntries(parseJson<any[]>(def?.target_effects, [])),
        selfBuffs: normalizeEntries(parseJson<any[]>(def?.self_effects, [])),
      };
    });
  }

  private snapshot(session: { state: BattleState; rounds: number }): BattleSnapshot {
    const { state, rounds } = session;
    return {
      player: this.sideSnap(state.player),
      mob: this.sideSnap(state.mob),
      over: state.over,
      winner: state.winner,
      round: rounds,
      log: state.log.slice(-50),
      skills: state.skills.map((s) => ({ id: s.id, name: s.name, itemId: s.itemId ?? null, energyCost: s.energyCost, attr: s.attr })),
    };
  }

  private sideSnap(c: BattleState['player']): SideSnapshot {
    return {
      name: c.name,
      level: c.level,
      hp: c.hp,
      maxHp: c.maxHp,
      energy: c.energy,
      maxEnergy: c.maxEnergy,
      buffs: c.buffs.map((ab) => {
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
