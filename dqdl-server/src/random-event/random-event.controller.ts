import { Controller, Get, Post, Body } from '@nestjs/common';
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

  /** 落地 effect：扣/加金币、给物品，返回刷新后的金币与背包 */
  @Post('apply')
  apply(@Body() body: { playerId: number; effects: EventEffect[] }) {
    return this.randomEventService.apply(Number(body.playerId), body.effects || []);
  }

  /** 启用事件列表（调试/作者用） */
  @Get()
  list() {
    return this.randomEventService.findAllEnabled();
  }
}
