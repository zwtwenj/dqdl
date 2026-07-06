import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { EventInstanceService, EventEffect, TriggerPayload } from './event-instance.service';
import { AgentOrchestrator } from './agent-orchestrator.service';
import { playerEvent } from '../event-bus/events';

@Controller('event')
export class RandomEventController {
  constructor(
    private readonly randomEventService: EventInstanceService,
    private readonly orchestrator: AgentOrchestrator,
  ) {}

  /** 触发检测：玩家动作后前端主动拉起（概率事件 + agent 派发消费） */
  @Post('check')
  async check(@Body() body: { playerId: number; type: string; payload: TriggerPayload }) {
    const r = await this.randomEventService.check(body.playerId, body.type, body.payload || {});
    return r;
  }

  /** 落地 effect（玩家选择某选项后） */
  @Post('apply')
  async apply(@Body() body: { playerId: number; effects: EventEffect[]; context?: { locationId?: number } }) {
    return this.randomEventService.apply(body.playerId, body.effects || [], body.context);
  }

  /** 同步事件快照（前端推进节点时持久化） */
  @Post('sync')
  async sync(@Body() body: { playerId: number; eventId: string; snapshot: any; ended: boolean }) {
    await this.randomEventService.syncEvent(body.playerId, body.eventId, body.snapshot, !!body.ended);
    return { ok: true };
  }

  /** 查询当前进行中的事件（页面刷新后恢复） */
  @Get('current')
  async current(@Query('playerId') playerId: number) {
    return this.randomEventService.getCurrent(Number(playerId));
  }

  /**
   * 调试端点：强制触发一次 agent 编排（绕过采样率与冷却门控）。
   * 编排成功后按 delivery 派发（默认 immediate，立即写入 event_instance，前端轮询/刷新可弹出）。
   */
  @Post('debug-orchestrate')
  async debugOrchestrate(@Body() body: { playerId: number; type?: string }) {
    const type = body.type || 'breakthrough';
    const evt = playerEvent(body.playerId, type, {});
    const r = await this.orchestrator.orchestrateOnce(evt);
    return r;
  }
}
