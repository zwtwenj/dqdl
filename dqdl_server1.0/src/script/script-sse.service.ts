import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';

/**
 * 剧本 SSE 连接池：维护「playerId → 响应流」映射。
 *
 * 用途：玩家进入游戏后建立 SSE 长连接（GET /api/script/stream），
 *   ScriptTrigger 命中剧本时调用 push(playerId, payload) 实时推送给该玩家。
 *
 * 设计：
 *   - 一个玩家允许一个连接（重复建连会覆盖旧的，避免泄漏）
 *   - push 时连接已断开/不存在 → 静默丢弃（不影响触发判断主流程）
 *   - 周期心跳防中间代理断连（30s 一次 comment 行）
 *
 * 消息格式（与修炼室 SSE 一致）：
 *   event: trigger\ndata: {outline_id, story_id, title, hook}\n\n
 */
@Injectable()
export class ScriptSseService {
  private readonly logger = new Logger(ScriptSseService.name);
  /** playerId → 响应流（一个玩家一个连接） */
  private readonly connections = new Map<number, Response>();
  /** 心跳定时器（按 playerId 管理，断开时清理） */
  private readonly heartbeats = new Map<number, NodeJS.Timeout>();

  /**
   * 注册一个玩家的 SSE 连接。
   * 若该玩家已有连接，先关旧的（避免泄漏；前端重连场景）。
   * 启动 30s 心跳（防代理超时断连）。
   */
  register(playerId: number, res: Response): void {
    // 已有旧连接：清理
    if (this.connections.has(playerId)) {
      this.unregister(playerId);
    }
    this.connections.set(playerId, res);

    // 心跳：每 30s 写一行注释（: heartbeat），仅保活，不产生客户端事件
    const timer = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        this.unregister(playerId);
      }
    }, 30_000);
    this.heartbeats.set(playerId, timer);

    this.logger.log(`SSE 连接已建立: player=${playerId} (当前连接数 ${this.connections.size})`);
  }

  /** 注销一个玩家的连接（清理心跳 + 从池中移除）。不主动 end 响应（由调用方控制）。 */
  unregister(playerId: number): void {
    const timer = this.heartbeats.get(playerId);
    if (timer) {
      clearInterval(timer);
      this.heartbeats.delete(playerId);
    }
    this.connections.delete(playerId);
  }

  /**
   * 推送剧本命中事件给某玩家。连接不存在/写失败 → 静默丢弃（不影响触发）。
   * @returns true=推送成功；false=无连接或失败
   */
  push(playerId: number, payload: Record<string, any>): boolean {
    const res = this.connections.get(playerId);
    if (!res) return false;
    try {
      res.write(`event: trigger\ndata: ${JSON.stringify(payload)}\n\n`);
      return true;
    } catch (e) {
      this.logger.warn(`SSE 推送失败，清理连接: player=${playerId} err=${(e as Error).message}`);
      this.unregister(playerId);
      return false;
    }
  }

  /** 当前连接数（调试/监控用）。 */
  get size(): number {
    return this.connections.size;
  }
}
