import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CultivationRoomSession } from './cultivation_room_session.entity';
import { PlayerService, PLAYER_STATUS } from '../player/player.service';

/** 基础斗气浓郁度（与洞天福地一致） */
const BASE_QI = 150;
/** 档位 → 修炼倍率（与洞天福地星级同：1=×1, 2=×2, 3=×4） */
const TIER_MULT: Record<number, number> = { 1: 1, 2: 2, 3: 4 };
/** 档位 → 每跳金币消耗 */
const TIER_COST: Record<number, number> = { 1: 200, 2: 400, 3: 800 };

const STATUS_IDLE = PLAYER_STATUS.IDLE;
/** 室内修炼专用状态（区别于洞天福地的 status=4）。该状态下玩家不能离开地图。 */
const STATUS_ROOM_CULTIVATING = PLAYER_STATUS.ROOM_CULTIVATING;

@Injectable()
export class CultivationRoomService {
  private readonly logger = new Logger(CultivationRoomService.name);
  /** 结算间隔（开发 10s，正式可由 CULTIVATION_INTERVAL 配为 180000） */
  readonly interval: number;

  constructor(
    @InjectRepository(CultivationRoomSession)
    private readonly repo: Repository<CultivationRoomSession>,
    private readonly playerService: PlayerService,
    config: ConfigService,
  ) {
    this.interval = config.get<number>('CULTIVATION_INTERVAL', 10000);
  }

  /** 修炼室档位信息（供前端渲染选择） */
  getOptions() {
    return {
      interval: this.interval,
      tiers: [1, 2, 3].map((t) => ({
        tier: t,
        name: `${['一', '二', '三'][t - 1]}阶修炼室`,
        cost: TIER_COST[t],
        qi: BASE_QI * TIER_MULT[t],
      })),
    };
  }

  /** 进入修炼室：校验空闲 + 目标未修满；mode: qi=修炼斗气, technique=修炼功法, skill=修炼斗技 */
  async enter(
    playerId: number,
    tier: number,
    mode: string = 'qi',
    targetId?: number,
  ): Promise<any> {
    if (!TIER_COST[tier]) throw new BadRequestException('修炼室档位错误');
    const m = mode === 'technique' ? 'technique' : mode === 'skill' ? 'skill' : 'qi';
    await this.playerService.assertIdle(playerId, '进入修炼室');

    let tid: number | null = null;
    if (m === 'technique') {
      if (!targetId) throw new BadRequestException('请选择要修炼的功法');
      tid = Number(targetId);
      const st = await this.playerService.getTechniqueState(playerId, tid);
      if (!st) throw new BadRequestException('未习得该功法');
      if (st.max_cultivation > 0 && st.cultivation >= st.max_cultivation) {
        throw new BadRequestException('该功法修为已满');
      }
    } else if (m === 'skill') {
      if (!targetId) throw new BadRequestException('请选择要修炼的斗技');
      tid = Number(targetId);
      const st = await this.playerService.getSkillState(playerId, tid);
      if (!st) throw new BadRequestException('未习得该斗技');
      if (st.max_level > 0 && st.level >= st.max_level) {
        throw new BadRequestException('该斗技已修炼至满级');
      }
    } else {
      if (player.cultivation >= player.level_cultivation) {
        throw new BadRequestException('当前修为已满，无需修炼');
      }
    }

    // 旧会话标记结束
    await this.repo.update({ player_id: playerId, status: 'active' }, { status: 'stopped' });

    const session = this.repo.create({
      player_id: playerId,
      mode: m,
      target_technique_id: tid,
      tier,
      rounds: 0,
      total_gained: 0,
      total_cost: 0,
      status: 'active',
    });
    const saved = await this.repo.save(session);
    await this.playerService.setStatus(playerId, STATUS_ROOM_CULTIVATING);
    this.logger.log(`玩家 ${playerId} 进入 ${tier}阶修炼室 (${m}${tid != null ? `#${tid}` : ''})`);
    return { ...saved, progress: await this.progressFor(player, saved) };
  }

  /** 当前进行中的修炼室会话（附带进度，供前端恢复渲染） */
  async getCurrent(playerId: number): Promise<any> {
    const session = await this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { created_at: 'DESC' },
    });
    if (!session) return null;
    const player = await this.playerService.findByIdRaw(playerId);
    return { ...session, progress: await this.progressFor(player, session) };
  }

  /**
   * 结算一轮：扣金币 + 修炼（斗气或功法，公式相同）。
   * 金币不足或目标修为满则结束会话（结束的这一跳不再扣费/不再结算）。
   * 返回统一结构，含 progress（{mode,name,level,current,max}）供前端渲染进度条。
   */
  async settle(playerId: number): Promise<{
    mode: string; gained: number; critical: boolean; capped: boolean;
    rounds: number; total_gained: number; total_cost: number; money: number;
    progress: { mode: string; name: string; level: number; current: number; max: number };
    finished: boolean; reason: string | null;
  } | null> {
    const session = await this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { created_at: 'DESC' },
    });
    if (!session) return null;

    const cost = TIER_COST[session.tier] ?? TIER_COST[1];
    const player = await this.playerService.findByIdRaw(playerId);
    if (!player) {
      await this.endSession(session, 'stopped');
      return this.snapshot(session, player, 0, false, true, 'stopped');
    }

    const effectiveQi = BASE_QI * (TIER_MULT[session.tier] ?? 1);
    const targetId = session.target_technique_id;
    const isTechnique = session.mode === 'technique' && targetId != null;
    const isSkill = session.mode === 'skill' && targetId != null;

    // 目标修为是否已满（功法满 / 斗技满级 / 斗气满）→ 停止
    let targetFull = false;
    if (isTechnique) {
      const st = await this.playerService.getTechniqueState(playerId, targetId as number);
      targetFull = !!st && st.max_cultivation > 0 && st.cultivation >= st.max_cultivation;
    } else if (isSkill) {
      const st = await this.playerService.getSkillState(playerId, targetId as number);
      targetFull = !!st && st.max_level > 0 && st.level >= st.max_level;
    } else {
      targetFull = player.cultivation >= player.level_cultivation;
    }
    if (targetFull) {
      await this.endSession(session, 'finished');
      return this.snapshot(session, player, 0, true, true, 'full');
    }

    // 金币不足：停止
    if ((player.money ?? 0) < cost) {
      await this.endSession(session, 'finished');
      return this.snapshot(session, player, 0, false, true, 'insufficient');
    }

    // 扣金币 + 修炼
    await this.playerService.grantMoney(playerId, -cost);
    let gained: number;
    let critical = false;
    let capped = false;
    let justReachedFull = false;
    if (isTechnique) {
      const r = await this.playerService.cultivateTechnique(playerId, targetId as number, effectiveQi);
      gained = r.gained; critical = r.critical; justReachedFull = r.full;
    } else if (isSkill) {
      // 斗技：修为满自动突破，仅当达到满级(maxed)才会结束会话
      const r = await this.playerService.cultivateSkill(playerId, targetId as number, effectiveQi);
      gained = r.gained; critical = r.critical; justReachedFull = r.maxed;
    } else {
      const r = await this.playerService.cultivate(playerId, effectiveQi);
      gained = r.gained; critical = r.critical; capped = r.capped;
      justReachedFull = (r.newCultivation >= r.level_cultivation);
    }

    session.rounds += 1;
    session.total_gained += gained;
    session.total_cost += cost;
    await this.repo.save(session);

    if (justReachedFull) await this.endSession(session, 'finished');
    const fresh = await this.playerService.findByIdRaw(playerId);
    return {
      mode: session.mode,
      gained, critical, capped,
      rounds: session.rounds,
      total_gained: session.total_gained,
      total_cost: session.total_cost,
      money: fresh?.money ?? 0,
      progress: await this.progressFor(fresh, session),
      finished: justReachedFull,
      reason: justReachedFull ? 'full' : null,
    };
  }

  /** 主动停止修炼 */
  async stop(playerId: number): Promise<void> {
    const session = await this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { created_at: 'DESC' },
    });
    if (!session) throw new NotFoundException('没有进行中的修炼');
    await this.endSession(session, 'stopped');
    this.logger.log(`玩家 ${playerId} 中止修炼室修炼`);
  }

  /**
   * 兜底回收：若玩家仍有 active 会话，则结束它并恢复空闲状态。
   * 用于 SSE 断开（如刷新页面）时防止状态卡在「室内修炼」。幂等。
   */
  async abortActive(playerId: number): Promise<void> {
    const session = await this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { created_at: 'DESC' },
    });
    if (session) {
      await this.endSession(session, 'stopped');
      this.logger.log(`玩家 ${playerId} 修炼室会话因连接断开被回收`);
    }
  }

  private async endSession(session: CultivationRoomSession, status: 'stopped' | 'finished') {
    session.status = status;
    await this.repo.save(session);
    await this.playerService.setStatus(session.player_id, STATUS_IDLE);
  }

  /** 组装当前进度（斗气=玩家修为槽；功法=该项功法的修为槽），供前端进度条渲染 */
  private async progressFor(
    player: any,
    session: CultivationRoomSession,
  ): Promise<{ mode: string; name: string; level: number; current: number; max: number }> {
    if (session.mode === 'technique' && session.target_technique_id) {
      const st = player ? await this.playerService.getTechniqueState(player.id, session.target_technique_id) : null;
      if (st) return { mode: 'technique', name: st.name, level: st.level, current: st.cultivation, max: st.max_cultivation };
      return { mode: 'technique', name: '功法', level: 1, current: 0, max: 0 };
    }
    if (session.mode === 'skill' && session.target_technique_id) {
      const st = player ? await this.playerService.getSkillState(player.id, session.target_technique_id) : null;
      if (st) return { mode: 'skill', name: st.name, level: st.level, current: st.cultivation, max: st.max_cultivation };
      return { mode: 'skill', name: '斗技', level: 1, current: 0, max: 0 };
    }
    return {
      mode: 'qi',
      name: '斗气修为',
      level: player?.level ?? 1,
      current: player?.cultivation ?? 0,
      max: player?.level_cultivation ?? 0,
    };
  }

  /** 组装一份不结算的快照（用于异常/前置终止时），结构与 settle 一致 */
  private async snapshot(
    session: CultivationRoomSession,
    player: any,
    gained: number,
    capped: boolean,
    finished: boolean,
    reason: string | null,
  ) {
    return {
      mode: session.mode,
      gained,
      critical: false,
      capped,
      rounds: session.rounds,
      total_gained: session.total_gained,
      total_cost: session.total_cost,
      money: player?.money ?? 0,
      progress: await this.progressFor(player, session),
      finished,
      reason,
    };
  }
}
