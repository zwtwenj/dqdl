import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MoveSession } from './move-session.entity';
import { Player } from '../player/player.entity';
import { LocationNet } from '../location_net/location-net.entity';
import { Biz } from '../common/biz.exception';
import { PLAYER_STATUS, levelAttrBonus } from '../player/player.service';
import { ScriptSseService } from '../script/script-sse.service';

/** 移动距离常量（里），对齐 location-net.service 里的硬编码 70 */
export const MOVE_DISTANCE = 70;

/**
 * 移动服务：基于速度的移动系统。
 *
 * 速度 = base_quick + levelAttrBonus(level)（实时计算，纯基础敏捷决定，
 *   不含功法/宝物加成——敏捷是角色天赋，移动快慢由天赋+等级成长决定）。
 * 时长(秒) = ceil(距离 × 60 / 速度)。
 *
 * 流程：start(建session+锁status) → 前端倒计时 → arrive(改location_id+解锁)。
 * 可 cancel(取消+解锁)。
 */
@Injectable()
export class MoveSessionService {
  private readonly logger = new Logger(MoveSessionService.name);

  constructor(
    @InjectRepository(MoveSession)
    private readonly repo: Repository<MoveSession>,
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
    @InjectRepository(LocationNet)
    private readonly netRepo: Repository<LocationNet>,
    private readonly sse: ScriptSseService,
  ) {}

  /**
   * 预览移动时间（不创建 session，供前端确认弹窗显示）。
   * @returns { duration_sec, duration_min, distance, speed, to_name }
   */
  async preview(playerId: number, toNetId: number): Promise<any> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);

    const from = await this.netRepo.findOneBy({ id: player.location_id ?? undefined });
    const to = await this.netRepo.findOneBy({ id: toNetId });
    if (!to) throw Biz.notFound(`地图节点 ${toNetId} 不存在`);

    // 校验邻接
    this.assertAdjacent(from, to);

    // 速度 = base_quick + levelAttrBonus（实时计算当前敏捷，不依赖存储的当前字段）
    const speed = player.base_quick + levelAttrBonus(player.level);
    const durationSec = Math.ceil((MOVE_DISTANCE * 60) / Math.max(1, speed));

    return {
      distance: MOVE_DISTANCE,
      speed,
      duration_sec: durationSec,
      duration_min: Math.ceil(durationSec / 60),
      to_name: to.name,
      to_net_id: toNetId,
    };
  }

  /**
   * 开始移动：校验邻接+status=IDLE → 创建 move_session → status=MOVING。
   * @returns 创建的 session（含 end_at）
   */
  async startMove(playerId: number, toNetId: number): Promise<MoveSession> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    if (player.status !== PLAYER_STATUS.IDLE) {
      throw Biz.conflict(`当前状态为「忙碌」，无法移动`);
    }

    const from = await this.netRepo.findOneBy({ id: player.location_id ?? undefined });
    const to = await this.netRepo.findOneBy({ id: toNetId });
    if (!to) throw Biz.notFound(`地图节点 ${toNetId} 不存在`);
    this.assertAdjacent(from, to);

    // 速度 = base_quick + levelAttrBonus（实时计算当前敏捷）
    const speed = player.base_quick + levelAttrBonus(player.level);
    const durationSec = Math.ceil((MOVE_DISTANCE * 60) / Math.max(1, speed));
    const now = new Date();
    const endAt = new Date(now.getTime() + durationSec * 1000);

    // 锁玩家状态
    player.status = PLAYER_STATUS.MOVING;
    await this.playerRepo.save(player);

    // 建 session
    const session = await this.repo.save(
      this.repo.create({
        player_id: playerId,
        from_net_id: player.location_id ?? 0,
        to_net_id: toNetId,
        from_name: from?.name || null,
        to_name: to.name,
        distance: MOVE_DISTANCE,
        speed,
        duration_sec: durationSec,
        start_at: now,
        end_at: endAt,
        status: 'active',
      }),
    );

    this.logger.log(`玩家 ${playerId} 开始移动 → ${to.name}(${toNetId})，时长 ${durationSec}秒`);
    return session;
  }

  /**
   * 到达结算：校验 end_at 已过 → 更新 location_id → status=IDLE → session=arrived。
   * 不走 getActiveSession（它含 lazy arrive 会先消费 session），直接查 active。
   */
  async arrive(playerId: number): Promise<{ session: MoveSession; to_net_id: number }> {
    // 直接查 active session（不走 getActiveSession，避免 lazy arrive 冲突）
    const session = await this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { id: 'DESC' },
    });
    if (!session) throw Biz.notFound('无进行中的移动');

    const now = new Date();
    if (now < session.end_at) {
      throw Biz.conflict('尚未到达目的地');
    }

    // 更新 player location + 恢复 IDLE
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    player.location_id = session.to_net_id;
    player.scene_id = null;
    player.status = PLAYER_STATUS.IDLE;
    await this.playerRepo.save(player);

    // 更新 session
    session.status = 'arrived';
    await this.repo.save(session);

    // 推送到达事件给前端（通用 SSE 通道）：前端据此刷新玩家状态/地图，
    // 无需前端倒计时到期再主动 arrive。连接不存在则静默（不影响结算主流程）。
    this.sse.push(playerId, 'move_arrived', {
      to_net_id: session.to_net_id,
      to_name: session.to_name,
    });

    this.logger.log(`玩家 ${playerId} 到达 ${session.to_name}(${session.to_net_id})`);
    return { session, to_net_id: session.to_net_id };
  }

  /**
   * 取消移动：session=cancelled → 恢复 IDLE。
   * 玩家保持在 from_net_id（不移动到目标）。
   */
  async cancelMove(playerId: number): Promise<void> {
    // 直接查 active session（不走 getActiveSession，避免 lazy arrive 冲突）
    const session = await this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { id: 'DESC' },
    });
    if (!session) throw Biz.notFound('无进行中的移动');

    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    player.status = PLAYER_STATUS.IDLE;
    await this.playerRepo.save(player);

    session.status = 'cancelled';
    await this.repo.save(session);

    this.logger.log(`玩家 ${playerId} 取消移动（目标 ${session.to_name}）`);
  }

  /**
   * 查当前活跃移动 session（供前端恢复弹窗 / pending_states 用）。
   * 若 end_at 已过，自动到达（lazy arrive）。
   * @returns session 或 null
   */
  async getActiveSession(playerId: number): Promise<MoveSession | null> {
    const session = await this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { id: 'DESC' },
    });
    if (!session) return null;

    // lazy arrive：如果已过 end_at，自动到达
    if (new Date() >= session.end_at) {
      await this.arrive(playerId).catch(() => {});
      // 返回 null（已到达，不再是 active）
      return null;
    }
    return session;
  }

  /** 校验对角邻接（|dx|==1 && |dy|==1） */
  private assertAdjacent(from: LocationNet | null, to: LocationNet): void {
    if (!from) return; // 无起点（新玩家）允许
    const dx = Math.abs(to.gx - from.gx);
    const dy = Math.abs(to.gy - from.gy);
    if (dx !== 1 || dy !== 1) {
      throw Biz.conflict('两地不相邻（仅对角方向可达），无法移动');
    }
  }
}
