import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CultivationSession } from './cultivation_session.entity';
import { PlayerService } from '../player/player.service';
import { EncounterService } from '../encounter/encounter.service';

/** 洞天福地基础斗气浓郁度（再乘星级倍率） */
const BASE_QI = 150;
/** 星级 → 修炼倍率 */
const STAR_MULT: Record<number, number> = { 1: 1, 2: 2, 3: 4 };
/** 最大结算轮次 */
const MAX_ROUNDS = 10;
/** 玩家状态：4 = 修炼中 */
const STATUS_CULTIVATING = 4;
const STATUS_IDLE = 1;

@Injectable()
export class CultivationService {
  private readonly logger = new Logger(CultivationService.name);
  /** 结算间隔（开发 10s，正式可由 CULTIVATION_INTERVAL 配为 180000） */
  readonly interval: number;

  constructor(
    @InjectRepository(CultivationSession)
    private readonly repo: Repository<CultivationSession>,
    private readonly playerService: PlayerService,
    private readonly encounterService: EncounterService,
    config: ConfigService,
  ) {
    this.interval = config.get<number>('CULTIVATION_INTERVAL', 10000);
  }

  /** 进入洞天福地：校验空闲、消耗奇遇、创建会话、玩家状态置为修炼(4) */
  async enter(playerId: number, encounterId: number): Promise<CultivationSession> {
    const player = await this.playerService.findByIdRaw(playerId);
    if (!player) throw new NotFoundException('玩家不存在');
    if (player.status !== STATUS_IDLE) {
      throw new BadRequestException('正在进行别的事物，请完成后再尝试进入');
    }

    const enc = await this.encounterService.consume(encounterId, playerId);
    if (!enc || enc.kind !== 'cultivate') {
      throw new NotFoundException('奇遇不存在或不是洞天福地');
    }

    // 旧会话（若有）标记结束
    await this.repo.update({ player_id: playerId, status: 'active' }, { status: 'stopped' });

    const session = this.repo.create({
      player_id: playerId,
      encounter_id: enc.id,
      star: enc.star || 1,
      rounds: 0,
      max_rounds: MAX_ROUNDS,
      total_gained: 0,
      status: 'active',
    });
    const saved = await this.repo.save(session);
    await this.playerService.setStatus(playerId, STATUS_CULTIVATING);
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

  /** 结算一轮修炼（由 SSE 定时调用），复用玩家修炼公式（含 factor/growth/暴击/上限） */
  async settle(playerId: number): Promise<{
    gained: number; critical: boolean; capped: boolean;
    rounds: number; max_rounds: number; finished: boolean;
    total_gained: number; cultivation: number; level_cultivation: number;
  } | null> {
    const session = await this.getCurrent(playerId);
    if (!session) return null;

    const effectiveQi = BASE_QI * (STAR_MULT[session.star] ?? 1);
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
      await this.playerService.setStatus(playerId, STATUS_IDLE);
      this.logger.log(`玩家 ${playerId} 洞天福地修炼完成，共获得 ${session.total_gained} 修为`);
    }

    return {
      gained: r.gained, critical: r.critical, capped: r.capped,
      rounds: session.rounds, max_rounds: session.max_rounds, finished,
      total_gained: session.total_gained,
      cultivation: r.newCultivation, level_cultivation: r.level_cultivation,
    };
  }

  /** 主动停止修炼 */
  async stop(playerId: number): Promise<void> {
    const session = await this.getCurrent(playerId);
    if (!session) throw new NotFoundException('没有进行中的修炼');
    session.status = 'stopped';
    await this.repo.save(session);
    if (session.encounter_id) await this.encounterService.markDone(session.encounter_id, playerId);
    await this.playerService.setStatus(playerId, STATUS_IDLE);
    this.logger.log(`玩家 ${playerId} 中止洞天福地修炼`);
  }
}
