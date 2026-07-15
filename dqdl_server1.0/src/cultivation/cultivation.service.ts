import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CultivationSession } from './cultivation-session.entity';
import { PlayerService, PLAYER_STATUS } from '../player/player.service';
import { EncounterService } from '../encounter/encounter.service';
import { Biz } from '../common/biz.exception';
import { BLESSSED_LAND } from '../config/game.config';

/**
 * 洞天福地修炼服务。
 *
 * 由 encounter(kind='cultivate') 触发：玩家在奇遇列表点「进入」→ enter 建会话、
 * 置玩家状态为 CULTIVATING(4)；前端开 SSE 流，每 interval 结算一轮（调
 * PlayerService.cultivate 增加修为），rounds 达 max_rounds 自动结束。
 *
 * 收益公式（与老版本一致，复用 PlayerService.cultivate）：
 *   effectiveQi = BASE_QI × STAR_MULT[star]
 *   gained = round(effectiveQi × (0.9+rand*0.2) × growth / 100)，10% 暴击×3
 *
 * 断流兜底（abortActive）：SSE 断开时回收会话 + 恢复玩家空闲，
 * 避免 status 永久卡在 4。
 */
@Injectable()
export class CultivationService {
  private readonly logger = new Logger(CultivationService.name);
  /** 结算间隔（开发 10s，正式可由 CULTIVATION_INTERVAL 配为更长） */
  readonly interval: number;

  constructor(
    @InjectRepository(CultivationSession)
    private readonly repo: Repository<CultivationSession>,
    private readonly playerService: PlayerService,
    private readonly encounterService: EncounterService,
    config: ConfigService,
  ) {
    this.interval = Number(process.env.CULTIVATION_INTERVAL) || config.get<number>('CULTIVATION_INTERVAL') || BLESSSED_LAND.intervalMs;
  }

  /** 进入洞天福地：校验空闲、消耗奇遇、创建会话、玩家状态置为修炼(4) */
  async enter(playerId: number, encounterId: number): Promise<CultivationSession> {
    await this.playerService.assertIdle(playerId);

    const enc = await this.encounterService.consume(encounterId, playerId);
    if (!enc || enc.kind !== 'cultivate') {
      throw Biz.notFound('奇遇不存在或不是洞天福地');
    }

    // 旧会话（若有）标记结束
    await this.repo.update({ player_id: playerId, status: 'active' }, { status: 'stopped' });

    const session = this.repo.create({
      player_id: playerId,
      encounter_id: enc.id,
      star: enc.star || 1,
      rounds: 0,
      max_rounds: BLESSSED_LAND.maxRounds,
      total_gained: 0,
      status: 'active',
    });
    const saved = await this.repo.save(session);
    await this.playerService.setStatus(playerId, PLAYER_STATUS.CULTIVATING);
    this.logger.log(`玩家 ${playerId} 进入 ${saved.star} 星洞天福地修炼`);
    return saved;
  }

  /** 获取当前进行中的修炼会话 */
  getCurrent(playerId: number): Promise<CultivationSession | null> {
    return this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { created_at: 'DESC' },
    });
  }

  /** 结算一轮修炼（由 SSE 定时调用），复用玩家修炼公式 */
  async settle(playerId: number): Promise<{
    gained: number;
    critical: boolean;
    capped: boolean;
    rounds: number;
    max_rounds: number;
    finished: boolean;
    total_gained: number;
    cultivation: number;
    level_cultivation: number;
  } | null> {
    const session = await this.getCurrent(playerId);
    if (!session) return null;

    const effectiveQi = BLESSSED_LAND.baseQi * (BLESSSED_LAND.starMult[session.star] ?? 1);
    const r = await this.playerService.cultivate(playerId, effectiveQi);

    session.rounds += 1;
    session.total_gained += r.gained;
    let finished = false;
    if (session.rounds >= session.max_rounds) {
      session.status = 'finished';
      finished = true;
    }
    await this.repo.save(session);

    if (finished) {
      if (session.encounter_id) await this.encounterService.markDone(session.encounter_id, playerId);
      await this.playerService.setStatus(playerId, PLAYER_STATUS.IDLE);
      this.logger.log(`玩家 ${playerId} 洞天福地修炼完成，共获得 ${session.total_gained} 修为`);
    }

    return {
      gained: r.gained,
      critical: r.critical,
      capped: r.capped,
      rounds: session.rounds,
      max_rounds: session.max_rounds,
      finished,
      total_gained: session.total_gained,
      cultivation: r.cultivation,
      level_cultivation: r.level_cultivation,
    };
  }

  /** 主动停止修炼 */
  async stop(playerId: number): Promise<void> {
    const session = await this.getCurrent(playerId);
    if (!session) throw Biz.notFound('没有进行中的修炼');
    session.status = 'stopped';
    await this.repo.save(session);
    if (session.encounter_id) await this.encounterService.markDone(session.encounter_id, playerId);
    await this.playerService.setStatus(playerId, PLAYER_STATUS.IDLE);
    this.logger.log(`玩家 ${playerId} 中止洞天福地修炼`);
  }

  /**
   * 兜底回收：SSE 流断开（客户端关闭/刷新/崩溃）时调用。
   * 幂等：有 active 会话则标记停止 + 置玩家空闲；无则跳过。
   * 防止玩家刷新页面后 status 卡在 4，无 UI 路径恢复。
   */
  async abortActive(playerId: number): Promise<void> {
    const session = await this.getCurrent(playerId);
    if (!session) {
      const p = await this.playerService.getEntity(playerId);
      if (p && p.status === PLAYER_STATUS.CULTIVATING) {
        await this.playerService.setStatus(playerId, PLAYER_STATUS.IDLE);
      }
      return;
    }
    session.status = 'stopped';
    await this.repo.save(session);
    if (session.encounter_id) await this.encounterService.markDone(session.encounter_id, playerId);
    await this.playerService.setStatus(playerId, PLAYER_STATUS.IDLE);
    this.logger.log(`玩家 ${playerId} 洞天福地会话被兜底回收`);
  }
}
