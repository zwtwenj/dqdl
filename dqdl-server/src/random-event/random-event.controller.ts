import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { RandomEventService, EventEffect, TriggerPayload } from './random-event.service';

@Controller('event')
export class RandomEventController {
  constructor(private readonly randomEventService: RandomEventService) {}

  /** 触发检测：返回掷中的事件节点图，或 null */
  @Post('check')
  check(
    @Body() body: { playerId: number; type: string; payload: TriggerPayload },
  ) {
    return this.randomEventService.check(Number(body.playerId), body.type, body.payload || {});
  }

  /** 落地 effect：扣/加金币、给物品、接取锻造委托，返回刷新后的金币与背包 */
  @Post('apply')
  apply(
    @Body() body: { playerId: number; effects: EventEffect[]; context?: { locationId?: number } },
  ) {
    return this.randomEventService.apply(
      Number(body.playerId),
      body.effects || [],
      body.context || {},
    );
  }

  /** 同步进行中事件的对话快照与状态（started→in_progress，ended 收尾） */
  @Post('sync')
  sync(@Body() body: { playerId: number; eventId: string; snapshot: any; ended?: boolean }) {
    return this.randomEventService.syncEvent(
      Number(body.playerId),
      body.eventId,
      body.snapshot || {},
      !!body.ended,
    );
  }

  /** 获取玩家当前进行中的事件(未 ended)，用于刷新后恢复 */
  @Get('current')
  current(@Query('playerId') playerId: string) {
    return this.randomEventService.getCurrent(Number(playerId));
  }

  /** 启用事件列表（调试/作者用） */
  @Get()
  list() {
    return this.randomEventService.findAllEnabled();
  }
}
