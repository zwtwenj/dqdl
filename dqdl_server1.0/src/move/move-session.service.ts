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

  /** 返回 session 给前端时调用：把 line 从 JSON 字符串解析成数组对象，便于前端直接用。 */
  private withParsedLine(session: MoveSession | null): any {
    if (!session) return session;
    let line: any[] | null = null;
    try {
      line = session.line ? JSON.parse(session.line) : null;
    } catch {
      line = null;
    }
    return { ...session, line };
  }

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
   * 开始移动：接收前端寻路好的节点序列 → 生成段结构 line → 落库 → 锁 MOVING。
   * line 段结构：[{ start:{id,name,gx,gy}, end:{id,name,gx,gy}, startTime, endTime }, ...]
   * 每段时长相等（=单段距离×60/速度），startTime/endTime 顺序累加，startMove 时全算好。
   * arrive/cancel/恢复 都直接读 line 段，无需重算时间。
   */
  async startMove(playerId: number, nodes: Array<{ id: number; name: string; gx: number; gy: number }>): Promise<any> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    if (player.status !== PLAYER_STATUS.IDLE) {
      throw Biz.conflict(`当前状态为「忙碌」，无法移动`);
    }
    if (!Array.isArray(nodes) || nodes.length < 2) {
      throw Biz.conflict('移动路径无效（至少需要起终点两个节点）');
    }
    const fromId = player.location_id ?? 0;
    if (nodes[0].id !== fromId) {
      throw Biz.conflict('移动路径起点与当前位置不符');
    }

    // 速度 = base_quick + levelAttrBonus（实时计算当前敏捷）
    const speed = player.base_quick + levelAttrBonus(player.level);
    const segSec = Math.ceil((MOVE_DISTANCE * 60) / Math.max(1, speed));
    const now = new Date();

    // 生成段结构：相邻节点组成一段，每段 startTime/endTime 顺序累加
    const segments: Array<{
      start: { id: number; name: string; gx: number; gy: number };
      end: { id: number; name: string; gx: number; gy: number };
      startTime: Date;
      endTime: Date;
    }> = [];
    let cursor = now.getTime();
    for (let i = 0; i < nodes.length - 1; i++) {
      const startTime = new Date(cursor);
      const endTime = new Date(cursor + segSec * 1000);
      segments.push({ start: nodes[i], end: nodes[i + 1], startTime, endTime });
      cursor = endTime.getTime();
    }

    // 锁玩家状态
    player.status = PLAYER_STATUS.MOVING;
    await this.playerRepo.save(player);

    const startNode = nodes[0];
    const destNode = nodes[nodes.length - 1];
    // 建 session：current_seg=0（第一段），end_at=第一段 endTime（兼容旧字段，恢复时也读 line[0].endTime）
    const session = await this.repo.save(
      this.repo.create({
        player_id: playerId,
        from_net_id: fromId,
        to_net_id: destNode.id,
        current_net_id: fromId,
        current_seg: 0,
        from_name: startNode.name,
        to_name: destNode.name,
        line: JSON.stringify(segments),
        distance: MOVE_DISTANCE,
        speed,
        duration_sec: segSec,
        start_at: now,
        end_at: segments[0].endTime,
        status: 'active',
      }),
    );

    this.logger.log(`玩家 ${playerId} 开始移动 → ${destNode.name}(${destNode.id})，${segments.length}段，每段 ${segSec}秒`);
    return this.withParsedLine(session);
  }

  /**
   * 走完当前段：校验当前段 endTime 已过 → current_seg++，推进到下一段。
   * line 段结构已含每段 startTime/endTime（startMove 时全算好），arrive 不重算时间。
   * - 还有后续段 → session 保持 active，end_at=下一段 endTime，SSE 推 move_arrived
   * - 已到末段 → session=finished，player=IDLE，SSE 推 move_finished
   */
  async arrive(playerId: number): Promise<{ session: any; finished: boolean }> {
    const session = await this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { id: 'DESC' },
    });
    if (!session) throw Biz.notFound('无进行中的移动');

    const segments = this.parseLine(session.line);
    const curSeg = segments[session.current_seg];
    if (!curSeg) {
      // 段索引越界（异常）：直接结束
      return this.finishMove(playerId, session);
    }
    if (new Date() < new Date(curSeg.endTime)) {
      throw Biz.conflict('尚未到达目的地');
    }

    // 当前段终点 = 玩家新位置
    const arrivedNode = curSeg.end;
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    player.location_id = arrivedNode.id;
    player.scene_id = null;

    session.current_net_id = arrivedNode.id;
    session.current_seg += 1;

    const isLast = session.current_seg >= segments.length;
    if (isLast) {
      // 走完全程
      session.status = 'finished';
      player.status = PLAYER_STATUS.IDLE;
      await this.playerRepo.save(player);
      await this.repo.save(session);
      this.sse.push(playerId, 'move_finished', { to_net_id: arrivedNode.id, to_name: arrivedNode.name });
      this.logger.log(`玩家 ${playerId} 抵达终点 ${arrivedNode.name}(${arrivedNode.id})，移动结束`);
      return { session: this.withParsedLine(session), finished: true };
    }

    // 还有下一段：end_at 更新为下一段 endTime（时间已在 line 里算好，直接读）
    session.end_at = new Date(segments[session.current_seg].endTime);
    await this.playerRepo.save(player);
    await this.repo.save(session);
    this.sse.push(playerId, 'move_arrived', { to_net_id: arrivedNode.id, to_name: arrivedNode.name });
    this.logger.log(`玩家 ${playerId} 到达 ${arrivedNode.name}(${arrivedNode.id})，继续第 ${session.current_seg + 1}/${segments.length} 段`);
    return { session: this.withParsedLine(session), finished: false };
  }

  /** 解析 line（段结构 JSON）为数组，异常返回 [] */
  private parseLine(raw: string | null): any[] {
    try {
      const v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  /** 结束移动（异常兜底/到终点通用）：session=finished，玩家停在 current_net_id，player=IDLE */
  private async finishMove(playerId: number, session: MoveSession): Promise<{ session: any; finished: boolean }> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (player) {
      player.location_id = session.current_net_id;
      player.status = PLAYER_STATUS.IDLE;
      await this.playerRepo.save(player);
    }
    session.status = 'finished';
    await this.repo.save(session);
    return { session: this.withParsedLine(session), finished: true };
  }

  /**
   * 取消移动：session=finished → 玩家停在 current_net_id（最近到达点）。
   * SSE 推 move_cancelled 让前端关弹窗刷新。
   */
  async cancelMove(playerId: number): Promise<void> {
    const session = await this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { id: 'DESC' },
    });
    if (!session) throw Biz.notFound('无进行中的移动');

    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    // 停在最近到达点（current_net_id）
    player.location_id = session.current_net_id;
    player.status = PLAYER_STATUS.IDLE;
    await this.playerRepo.save(player);

    session.status = 'finished';
    await this.repo.save(session);

    this.sse.push(playerId, 'move_cancelled', { stop_net_id: session.current_net_id });
    this.logger.log(`玩家 ${playerId} 取消移动，停留在 ${session.current_net_id}`);
  }

  /**
   * 查当前活跃移动 session（供前端恢复弹窗 / pending_states 用）。
   * 若 end_at 已过，自动到达（lazy arrive）。
   * @returns session 或 null
   */
  /**
   * 查当前活跃移动 session（供前端恢复弹窗用）。
   * 简单查询：按 player_id + status=active 查，有就返回。
   * 若玩家离线很久多段都过期：遍历 line 段推进 current_seg 到正确位置（避免循环 arrive 的副作用）。
   * 若全程已过期：结算到终点并返回 null。
   */
  async getActiveSession(playerId: number): Promise<any | null> {
    const session = await this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { id: 'DESC' },
    });
    if (!session) return null;

    const segments = this.parseLine(session.line);
    if (!segments.length) return this.withParsedLine(session);

    const now = Date.now();
    // 找到第一个 endTime 未过期的段；若全部过期，说明已到终点
    let targetSeg = -1;
    for (let i = 0; i < segments.length; i++) {
      if (now < new Date(segments[i].endTime).getTime()) {
        targetSeg = i;
        break;
      }
    }
    if (targetSeg === -1) {
      // 全程已过期：结算到终点
      const last = segments[segments.length - 1];
      const player = await this.playerRepo.findOneBy({ id: playerId });
      if (player) {
        player.location_id = last.end.id;
        player.status = PLAYER_STATUS.IDLE;
        await this.playerRepo.save(player);
      }
      session.current_net_id = last.end.id;
      session.current_seg = segments.length;
      session.status = 'finished';
      await this.repo.save(session);
      return null;
    }
    // 推进到 targetSeg（中间已过期的段视为已走完，玩家位置=该段起点）
    if (targetSeg !== session.current_seg) {
      session.current_seg = targetSeg;
      session.current_net_id = segments[targetSeg].start.id;
      session.end_at = new Date(segments[targetSeg].endTime);
      const player = await this.playerRepo.findOneBy({ id: playerId });
      if (player) {
        player.location_id = segments[targetSeg].start.id;
        await this.playerRepo.save(player);
      }
      await this.repo.save(session);
    }
    return this.withParsedLine(session);
  }

  /** 校验对角邻接（|dx|==1 && |dy|==1）—— 仅 preview 预览移动时间用，startMove 不再校验（前端已寻路） */
  private assertAdjacent(from: LocationNet | null, to: LocationNet): void {
    if (!from) return; // 无起点（新玩家）允许
    const dx = Math.abs(to.gx - from.gx);
    const dy = Math.abs(to.gy - from.gy);
    if (dx !== 1 || dy !== 1) {
      throw Biz.conflict('两地不相邻（仅对角方向可达），无法移动');
    }
  }
}
