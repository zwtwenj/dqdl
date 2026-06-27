import { Controller, Post, Param, Body, ParseIntPipe } from '@nestjs/common';
import { DialogEventService } from './dialog-event.service';

/**
 * 对话事件控制器：挂在与 NPC 同一前缀下，提供 POST /npc/:id/event。
 * 快捷对话的所有业务编排由 DialogEventService 统一处理。
 */
@Controller('npc')
export class DialogEventController {
  constructor(private readonly service: DialogEventService) {}

  /** 触发快捷对话事件，返回统一的 { type, npcReply, payload } */
  @Post(':id/event')
  async trigger(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { eventId: number; playerId: number; history?: any[] },
  ) {
    return this.service.handleEvent(id, body.eventId, body.playerId, body.history || []);
  }
}
