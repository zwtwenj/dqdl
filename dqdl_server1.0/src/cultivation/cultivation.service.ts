import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CultivationSession } from './cultivation-session.entity';
import { PlayerService, PLAYER_STATUS } from '../player/player.service';
import { EncounterService } from '../encounter/encounter.service';
import { Biz } from '../common/biz.exception';
import { BLESSSED_LAND, CULTIVATION_ROOM, CULTIVATION_MODE } from '../config/game.config';

/** 结束原因 */
export type EndReason =
  | 'full' // 修为满
  | 'timeout' // room 到期
  | 'rounds' // blessed 轮满
  | 'insufficient' // 金币不足
  | 'stopped' // 主动停止
  | 'error';

interface SettleResult {
  mode: string;
  gained: number;
  critical: boolean;
  rounds: number;
  total_gained: number;
  total_cost: number;
  money: number;
  finished: boolean;
  reason: EndReason | null;
  // 进度字段（按 mode 不同）：
  //   qi: cultivation / level_cultivation / capped
  //   skill: level / cultivation / max_cultivation / maxed / leveledUp
  //   technique: cultivation / max_cultivation / full
  [key: string]: any;
}

interface ResumeResult {
  gained: number;
  rounds: number;
  total_gained: number;
  total_cost: number;
  money: number;
  cultivation: number;
  level_cultivation: number;
  finished: boolean;
  reason: EndReason | null;
  // 进度字段（按 mode 不同，对齐 SettleResult）：
  //   qi: cultivation（本体修为）/ level_cultivation
  //   skill: cultivation / max_cultivation / level / maxed
  //   technique: cultivation / max_cultivation / full
  // 注意：skill/technique 模式下 cultivation 为目标斗技/功法的修为（非本体修为），
  // 否则前端进度条分母缺失会把进度条撑满。
  [key: string]: any;
}

/**
 * 统一修炼引擎（合并洞天福地 + 修炼室）。
 *
 * 两类场景共用同一套收益公式（PlayerService.cultivate）：
 *   effectiveQi = BLESSSED_LAND.baseQi × starMult[tier]
 *   单轮 gained = round(effectiveQi × (0.9+rand*0.2) × growth / 100)，10% 暴击×3，达上限截断。
 *
 * scene='blessed'（洞天福地）：奇遇驱动、免费、按 max_rounds(默认10轮) 结束、结束 markDone 奇遇。
 * scene='room'（修炼室）：城内付费、每轮扣金币、按玩家选的 planned_seconds(1~8分钟) 到时结束。
 *
 * 惰性离线补偿（resume/compensate）：
 *   SSE 断开（关页面/刷新）后端即停算，但保留 active 会话 + status=4（玩家锁定）。
 *   重连时 resume() 据 (now - last_settled_at) 算漏结算轮数，按期望值批量补发，与在线均值对齐。
 *
 * 玩家锁定：修炼中 status=CULTIVATING(4)，期间 assertIdle 守卫拦住战斗/历练/采集等其它活动。
 */
@Injectable()
export class CultivationService {
  private readonly logger = new Logger(CultivationService.name);
  /** 结算间隔（毫秒） */
  readonly interval: number;
  /** 暴击率/倍率，与 PlayerService.cultivate 内部一致（离线补偿期望值用） */
  private readonly CRIT_RATE = 0.1;
  private readonly CRIT_MULT = 3;

  constructor(
    @InjectRepository(CultivationSession)
    private readonly repo: Repository<CultivationSession>,
    private readonly playerService: PlayerService,
    private readonly encounterService: EncounterService,
    config: ConfigService,
  ) {
    this.interval =
      Number(process.env.CULTIVATION_INTERVAL) ||
      config.get<number>('CULTIVATION_INTERVAL') ||
      BLESSSED_LAND.intervalMs;
  }

  // ============ 选项（供前端渲染） ============

  /** 修炼室档位 + 时长范围 + 玩家可修炼的斗技/功法列表（供前端选档态选择） */
  async getOptions(playerId: number) {
    const player = await this.playerService.getEntity(playerId);
    const [skills, techniques] = player
      ? await Promise.all([
          this.listCultivableSkills(player),
          this.listCultivableTechniques(player),
        ])
      : [[], []];
    return {
      interval: this.interval,
      durations: CULTIVATION_ROOM.durations,
      minDuration: CULTIVATION_ROOM.minDurationMin,
      maxDuration: CULTIVATION_ROOM.maxDurationMin,
      tiers: [1, 2, 3].map((t) => ({
        tier: t,
        name: `${['一', '二', '三'][t - 1]}阶修炼室`,
        cost: CULTIVATION_ROOM.costPerTier[t],
        qi: BLESSSED_LAND.baseQi * BLESSSED_LAND.starMult[t],
      })),
      // 玩家已习得、且仍可修炼的斗技（未达 max_level）。满级的排除，避免误选。
      skills,
      // 玩家已习得、且当前级修为未满的功法。
      techniques,
    };
  }

  /** 列出玩家可修炼的斗技（已习得 + 未满级） */
  private async listCultivableSkills(player: any): Promise<any[]> {
    const list = await this.playerService.aggregateSkills(player.skill);
    return list
      .filter((s) => s.max_level == null || s.max_level <= 0 || (s.level || 1) < s.max_level)
      .map((s) => ({
        id: s.id, name: s.name, attr: s.attr, rank: s.rank,
        level: s.level, max_level: s.max_level,
        cultivation: s.cultivation, max_cultivation: s.max_cultivation,
        maxed: s.max_level != null && s.max_level > 0 && (s.level || 1) >= s.max_level,
      }));
  }

  /** 列出玩家可修炼的功法（已习得 + 当前级修为未满） */
  private async listCultivableTechniques(player: any): Promise<any[]> {
    const list = await this.playerService.aggregateTechniques(player.technique);
    return list
      .filter((t) => (t.max_cultivation || 0) <= 0 || (t.cultivation || 0) < (t.max_cultivation || 0))
      .map((t) => ({
        id: t.id, name: t.name, attribute: t.attribute, rank: t.rank,
        level: t.level, max_level: t.max_level,
        cultivation: t.cultivation, max_cultivation: t.max_cultivation,
        growth: t.growth ?? 10,
      }));
  }

  // ============ 进入 ============

  /** 进入洞天福地（blessed）：校验空闲 + 消耗奇遇 + 建会话 + 状态置 4 */
  async enterBlessed(playerId: number, encounterId: number): Promise<CultivationSession> {
    await this.playerService.assertIdle(playerId);

    const enc = await this.encounterService.consume(encounterId, playerId);
    if (!enc || enc.kind !== 'cultivate') {
      throw Biz.notFound('奇遇不存在或不是洞天福地');
    }

    await this.closeStaleActive(playerId);

    const session = this.repo.create({
      player_id: playerId,
      scene: 'blessed',
      encounter_id: enc.id,
      tier: enc.star || 1,
      rounds: 0,
      total_gained: 0,
      total_cost: 0,
      cost_per_round: 0,
      max_rounds: BLESSSED_LAND.maxRounds,
      planned_seconds: 0,
      last_settled_at: new Date(),
      status: 'active',
    });
    const saved = await this.repo.save(session);
    await this.playerService.setStatus(playerId, PLAYER_STATUS.CULTIVATING);
    this.logger.log(`玩家 ${playerId} 进入 ${saved.tier}星洞天福地修炼`);
    return saved;
  }

  /** 进入修炼室（room）：校验空闲 + 目标有效 + 校验时长/档位 + 建会话 + 状态置 4
   *  mode: qi=修为 / skill=斗技(自动突破) / technique=功法(满后停止)。
   *  skill/technique 模式需 targetId（斗技/功法主键）。 */
  async enterRoom(
    playerId: number,
    tier: number,
    durationMin: number,
    mode: string = 'qi',
    targetId?: number,
  ): Promise<CultivationSession> {
    const m = mode === 'skill' ? 'skill' : mode === 'technique' ? 'technique' : 'qi';
    if (!BLESSSED_LAND.starMult[tier]) throw Biz.badRequest('修炼室档位错误');
    if (
      durationMin < CULTIVATION_ROOM.minDurationMin ||
      durationMin > CULTIVATION_ROOM.maxDurationMin
    ) {
      throw Biz.badRequest('修炼时长超出可选范围');
    }
    await this.playerService.assertIdle(playerId);

    const player = await this.playerService.getEntity(playerId);
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);

    // 按 mode 校验修炼目标
    if (m === 'qi') {
      if (player.cultivation >= player.level_cultivation) {
        throw Biz.conflict('当前修为已满，无需修炼');
      }
    } else if (m === 'skill') {
      if (!targetId) throw Biz.badRequest('缺少斗技目标 targetId');
      const st = await this.playerService.getSkillState(playerId, Number(targetId));
      if (!st) throw Biz.badRequest('未习得该斗技');
      if (st.max_level > 0 && st.level >= st.max_level) throw Biz.conflict('该斗技已修炼至满级');
    } else {
      // technique
      if (!targetId) throw Biz.badRequest('缺少功法目标 targetId');
      const st = await this.playerService.getTechniqueState(playerId, Number(targetId));
      if (!st) throw Biz.badRequest('未习得该功法');
      if (st.max_cultivation > 0 && st.cultivation >= st.max_cultivation) {
        throw Biz.conflict('该功法当前境界修为已满');
      }
    }

    await this.closeStaleActive(playerId);

    const session = this.repo.create({
      player_id: playerId,
      scene: 'room',
      mode: m,
      target_id: m === 'qi' ? null : Number(targetId),
      encounter_id: null,
      tier,
      rounds: 0,
      total_gained: 0,
      total_cost: 0,
      cost_per_round: CULTIVATION_ROOM.costPerTier[tier] ?? 0,
      max_rounds: CULTIVATION_ROOM.roomMaxRounds,
      planned_seconds: durationMin * 60,
      last_settled_at: new Date(),
      status: 'active',
    });
    const saved = await this.repo.save(session);
    await this.playerService.setStatus(playerId, PLAYER_STATUS.CULTIVATING);
    this.logger.log(
      `玩家 ${playerId} 进入 ${tier}阶修炼室(${m})，计划修炼 ${durationMin} 分钟`,
    );
    return saved;
  }

  // ============ 查询 ============

  /** 当前进行中的修炼会话 */
  async getCurrent(playerId: number): Promise<CultivationSession | null> {
    return this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { created_at: 'DESC' },
    });
  }

  /** 最近一次会话（含已结束，供结算页取汇总） */
  async getLatest(playerId: number): Promise<CultivationSession | null> {
    return this.repo.findOne({
      where: { player_id: playerId },
      order: { created_at: 'DESC' },
    });
  }

  // ============ 实时结算 ============

  /** 结算一轮（SSE 每间隔调用）：扣金币 + 涨修为，并判定结束。 */
  async settle(playerId: number): Promise<SettleResult | null> {
    const session = await this.getCurrent(playerId);
    if (!session) return null;

    const player = await this.playerService.getEntity(playerId);
    if (!player) {
      await this.endSession(session, 'stopped', 'error');
      return null;
    }

    const cost = session.cost_per_round ?? 0;
    const effectiveQi = BLESSSED_LAND.baseQi * (BLESSSED_LAND.starMult[session.tier] ?? 1);

    // 按 mode 判定目标是否已满（满则直接结束，不再扣金币/结算）
    const preFull = await this.checkTargetFull(session, player);
    if (preFull) {
      await this.endSession(session, 'finished', 'full');
      return this.snapshot(session, player, 0, true, true, 'full');
    }
    // 金币不足 → 结束（仅 room）
    if (cost > 0 && (player.money ?? 0) < cost) {
      await this.endSession(session, 'finished', 'insufficient');
      return this.snapshot(session, player, 0, false, true, 'insufficient');
    }
    // 到期判定（room）：结算前先看是否已超计划时长
    if (session.scene === 'room' && this.isRoomExpired(session)) {
      await this.endSession(session, 'finished', 'timeout');
      return this.snapshot(session, player, 0, false, true, 'timeout');
    }

    // 扣金币（room）
    let money = player.money ?? 0;
    if (cost > 0) money = await this.playerService.grantMoney(playerId, -cost);

    // 按 mode 分发修炼
    const mode = (session.mode || 'qi') as 'qi' | 'skill' | 'technique';
    let gained = 0;
    let critical = false;
    // 目标进度（透传前端显示）
    let progress: any = {};
    // 是否应结束会话（skill 满级 / technique 单级满 / qi 本体满）
    let targetDone = false;

    if (mode === 'skill') {
      const r = await this.playerService.cultivateSkill(playerId, Number(session.target_id), effectiveQi);
      gained = r.gained; critical = r.critical;
      progress = { level: r.level, cultivation: r.cultivation, max_cultivation: r.max_cultivation, maxed: r.maxed, leveledUp: r.leveledUp };
      targetDone = r.maxed;
    } else if (mode === 'technique') {
      const r = await this.playerService.cultivateTechnique(playerId, Number(session.target_id), effectiveQi);
      gained = r.gained; critical = r.critical;
      progress = { cultivation: r.cultivation, max_cultivation: r.max_cultivation, full: r.full };
      targetDone = r.full;
    } else {
      // qi
      const r = await this.playerService.cultivate(playerId, effectiveQi);
      gained = r.gained; critical = r.critical;
      progress = { cultivation: r.cultivation, level_cultivation: r.level_cultivation, capped: r.capped };
      targetDone = r.capped && r.cultivation >= r.level_cultivation;
    }

    session.rounds += 1;
    session.total_gained += gained;
    session.total_cost += cost;
    session.last_settled_at = new Date();

    // 结束判定
    let finished = false;
    let reason: EndReason | null = null;
    if (targetDone) {
      finished = true;
      reason = 'full';
    } else if (session.scene === 'room' && this.isRoomExpired(session)) {
      finished = true;
      reason = 'timeout';
    } else if (session.scene === 'blessed' && session.rounds >= session.max_rounds) {
      finished = true;
      reason = 'rounds';
    }
    if (finished) await this.endSession(session, 'finished', reason ?? 'full');
    else await this.repo.save(session);

    return {
      mode,
      gained,
      critical,
      rounds: session.rounds,
      total_gained: session.total_gained,
      total_cost: session.total_cost,
      money,
      finished,
      reason,
      ...progress,
    };
  }

  /** 按 mode 判定修炼目标是否已满（结算前置检查，避免无效扣费） */
  private async checkTargetFull(session: CultivationSession, player: any): Promise<boolean> {
    const mode = session.mode || 'qi';
    if (mode === 'qi') {
      return player.cultivation >= player.level_cultivation;
    }
    if (mode === 'skill') {
      const st = await this.playerService.getSkillState(session.player_id, Number(session.target_id));
      return !!st && st.max_level > 0 && st.level >= st.max_level;
    }
    // technique
    const st = await this.playerService.getTechniqueState(session.player_id, Number(session.target_id));
    return !!st && st.max_cultivation > 0 && st.cultivation >= st.max_cultivation;
  }

  // ============ 惰性离线补偿 ============

  /**
   * 重连补偿（SSE 建立前调用）：据断线期间漏算的轮数按期望值批量补发。
   * 幂等：无 active 会话或无漏算则 no-op。返回补发后的会话快照（前端据此刷新）。
   */
  async resume(playerId: number): Promise<ResumeResult | null> {
    const session = await this.getCurrent(playerId);
    if (!session) return null;

    const now = Date.now();
    const base = this.baseTime(session); // 上次结算基准时刻

    if (session.scene === 'room') {
      const planEndMs = new Date(session.created_at).getTime() + session.planned_seconds * 1000;
      if (session.planned_seconds > 0 && now >= planEndMs) {
        // 已超计划时长：补发基准到计划结束时刻之间的漏算，然后结束
        const totalShouldSettle = Math.max(0, Math.floor((planEndMs - base) / this.interval));
        await this.compensate(session, totalShouldSettle);
        if (session.status === 'active') {
          await this.endSession(session, 'finished', 'timeout');
        }
        return this.buildResumeResult(session, playerId);
      }
    }

    // 普通断线：补发 (now - base) 之间漏算的整轮（当前这一轮尚未到时，不计入）
    const missedRounds = Math.max(0, Math.floor((now - base) / this.interval) - 1);
    if (missedRounds > 0) {
      await this.compensate(session, missedRounds);
    }
    // 重置基准，让后续 SSE 从此刻重新等 interval
    if (session.status === 'active') {
      session.last_settled_at = new Date();
      await this.repo.save(session);
    }
    return this.buildResumeResult(session, playerId);
  }

  /**
   * 批量补发 n 轮（离线补偿核心）。
   * 不逐轮调 cultivate（避免随机），用确定期望值 = cultivate 的长期均值：
   *   期望单轮 = round(effectiveQi × 1.0 × growth / 100) × (1 + critRate × (critMult-1))
   * growth 按 mode 取：qi=已装备功法 / skill=10 / technique=该功法 def.growth。
   * room 场景按金币余额截断补发轮数；skill 模式逐级模拟自动突破。
   */
  private async compensate(session: CultivationSession, n: number): Promise<void> {
    if (n <= 0 || session.status !== 'active') return;

    const player = await this.playerService.getEntity(session.player_id);
    if (!player) {
      await this.endSession(session, 'stopped', 'error');
      return;
    }

    const mode = (session.mode || 'qi') as 'qi' | 'skill' | 'technique';
    const effectiveQi = BLESSSED_LAND.baseQi * (BLESSSED_LAND.starMult[session.tier] ?? 1);

    // 目标已满 → 无需补发
    if (await this.checkTargetFull(session, player)) {
      await this.endSession(session, 'finished', 'full');
      return;
    }

    // growth 按 mode 取
    let growth = CULTIVATION_MODE.defaultGrowth;
    if (mode === 'qi') growth = await this.playerService.getEquippedTechniqueGrowth(player);
    else if (mode === 'skill') growth = CULTIVATION_MODE.skillGrowth;
    else growth = await this.playerService.getTechniqueDefGrowth(Number(session.target_id));
    const expectPerRound = Math.round(
      ((effectiveQi * 1.0 * growth) / 100) * (1 + this.CRIT_RATE * (this.CRIT_MULT - 1)),
    );

    // room：金币余额截断
    const cost = session.cost_per_round ?? 0;
    let rounds = n;
    let moneyShort = false;
    if (cost > 0) {
      const affordable = Math.floor((player.money ?? 0) / cost);
      if (affordable <= 0) {
        await this.endSession(session, 'finished', 'insufficient');
        return;
      }
      if (affordable < rounds) {
        rounds = affordable;
        moneyShort = true;
      }
    }
    // blessed：max_rounds 截断
    if (session.scene === 'blessed' && session.rounds + rounds >= session.max_rounds) {
      rounds = Math.max(0, session.max_rounds - session.rounds);
    }
    if (rounds <= 0) return;

    // 扣金币（room）
    if (cost > 0) {
      await this.playerService.grantMoney(session.player_id, -cost * rounds);
      session.total_cost += cost * rounds;
    }

    // 按 mode 补发修为
    let gained = 0;
    let targetFull = false;
    if (mode === 'skill') {
      const r = await this.compensateSkill(session, expectPerRound, rounds);
      gained = r.gained; targetFull = r.maxed;
    } else if (mode === 'technique') {
      const r = await this.compensateTechnique(session, expectPerRound, rounds);
      gained = r.gained; targetFull = r.full;
    } else {
      // qi：补到本体上限
      const want = expectPerRound * rounds;
      const after = Math.min(player.cultivation + want, player.level_cultivation);
      gained = after - player.cultivation;
      await this.playerService.setCultivation(session.player_id, after);
      targetFull = after >= player.level_cultivation;
    }

    session.rounds += rounds;
    session.total_gained += gained;
    session.last_settled_at = new Date();

    // 结束判定
    let reason: EndReason | null = null;
    if (targetFull) reason = 'full';
    else if (session.scene === 'room' && this.isRoomExpired(session)) reason = 'timeout';
    else if (session.scene === 'blessed' && session.rounds >= session.max_rounds) reason = 'rounds';
    else if (moneyShort) reason = 'insufficient';

    if (reason) await this.endSession(session, 'finished', reason);
    else await this.repo.save(session);
  }

  /** skill 补偿：委托 player.service 逐级模拟自动突破，受 max_level 截断。
   *  返回累计获得修为与是否已达满级。 */
  private async compensateSkill(
    session: CultivationSession,
    expectPerRound: number,
    rounds: number,
  ): Promise<{ gained: number; maxed: boolean }> {
    const r = await this.playerService.batchCultivateSkill(
      session.player_id,
      Number(session.target_id),
      expectPerRound,
      rounds,
    );
    return { gained: r.gained, maxed: r.maxed };
  }

  /** technique 补偿：委托 player.service 补到当前级上限（不升级）。
   *  返回获得修为与是否已满。 */
  private async compensateTechnique(
    session: CultivationSession,
    expectPerRound: number,
    rounds: number,
  ): Promise<{ gained: number; full: boolean }> {
    const r = await this.playerService.batchCultivateTechnique(
      session.player_id,
      Number(session.target_id),
      expectPerRound,
      rounds,
    );
    return { gained: r.gained, full: r.full };
  }

  // ============ 主动停止 ============

  /** 主动停止修炼：结束会话 + (blessed)markDone。返回最近会话汇总供结算页。 */
  async stop(playerId: number): Promise<CultivationSession | null> {
    const session = await this.getCurrent(playerId);
    if (!session) throw Biz.notFound('没有进行中的修炼');
    await this.endSession(session, 'stopped', 'stopped');
    this.logger.log(`玩家 ${playerId} 中止修炼（scene=${session.scene}）`);
    return this.getLatest(playerId);
  }

  // ============ 内部工具 ============

  /** 补偿基准时刻：优先 last_settled_at，回退 created_at */
  private baseTime(session: CultivationSession): number {
    return (session.last_settled_at ?? session.created_at).getTime();
  }

  /** room 是否已超过计划时长 */
  private isRoomExpired(session: CultivationSession): boolean {
    if (session.scene !== 'room' || session.planned_seconds <= 0) return false;
    const elapsedSec = (Date.now() - new Date(session.created_at).getTime()) / 1000;
    return elapsedSec >= session.planned_seconds;
  }

  /** 结束会话：写 ended_at + end_reason + status + 玩家状态置空闲 + (blessed)markDone */
  private async endSession(
    session: CultivationSession,
    status: 'stopped' | 'finished',
    reason: EndReason,
  ): Promise<void> {
    session.status = status;
    session.ended_at = new Date();
    session.end_reason = reason;
    await this.repo.save(session);
    if (session.scene === 'blessed' && session.encounter_id) {
      await this.encounterService.markDone(session.encounter_id, session.player_id);
    }
    await this.playerService.setStatus(session.player_id, PLAYER_STATUS.IDLE);
  }

  /** 关闭同玩家残留 active 会话（进入新会话前清理） */
  private async closeStaleActive(playerId: number): Promise<void> {
    await this.repo.update(
      { player_id: playerId, status: 'active' },
      { status: 'stopped', ended_at: new Date(), end_reason: 'stopped' },
    );
  }

  /** 异常/前置终止时的不结算快照 */
  private snapshot(
    session: CultivationSession,
    player: any,
    gained: number,
    capped: boolean,
    finished: boolean,
    reason: EndReason,
  ): SettleResult {
    const mode = session.mode || 'qi';
    const progress: any = mode === 'qi'
      ? { cultivation: player?.cultivation ?? 0, level_cultivation: player?.level_cultivation ?? 0, capped }
      : {};
    return {
      mode,
      gained,
      critical: false,
      rounds: session.rounds,
      total_gained: session.total_gained,
      total_cost: session.total_cost,
      money: player?.money ?? 0,
      finished,
      reason,
      ...progress,
    };
  }

  private async buildResumeResult(
    session: CultivationSession,
    playerId: number,
  ): Promise<ResumeResult> {
    const player = await this.playerService.getEntity(playerId);
    const mode = (session.mode || 'qi') as 'qi' | 'skill' | 'technique';

    // 基础累计字段（所有 mode 共用）
    const base: ResumeResult = {
      gained: 0,
      rounds: session.rounds,
      total_gained: session.total_gained,
      total_cost: session.total_cost,
      money: player?.money ?? 0,
      cultivation: player?.cultivation ?? 0,
      level_cultivation: player?.level_cultivation ?? 0,
      finished: session.status !== 'active',
      reason: (session.end_reason as EndReason) ?? null,
    };

    // skill/technique 模式：cultivation 须为目标斗技/功法的修为（非本体修为），
    // 否则前端进度条分母缺失（max_cultivation 未返回）会把进度条瞬间撑满。
    if (mode === 'skill' && session.target_id) {
      const st = await this.playerService.getSkillState(playerId, Number(session.target_id));
      if (st) {
        base.cultivation = st.cultivation;
        base.max_cultivation = st.max_cultivation;
        base.level = st.level;
        base.maxed = st.max_level > 0 && st.level >= st.max_level;
      }
    } else if (mode === 'technique' && session.target_id) {
      const st = await this.playerService.getTechniqueState(playerId, Number(session.target_id));
      if (st) {
        base.cultivation = st.cultivation;
        base.max_cultivation = st.max_cultivation;
        base.level = st.level;
        base.full = st.max_cultivation > 0 && st.cultivation >= st.max_cultivation;
      }
    }

    return base;
  }
}
