import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { NpcService } from './npc.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * NPC 接口：会话化对话。
 * 流程：打开弹窗 → POST /:npcId/session 建会话 → POST /session/:sessionId/talk 对话。
 */
@Controller('npc')
@UseGuards(JwtAuthGuard)
export class NpcController {
  constructor(private readonly npcService: NpcService) {}

  /** 某地点 NPC 列表 GET /api/npc/location/:locationId */
  @Get('location/:locationId')
  listByLocation(@Param('locationId', ParseIntPipe) locationId: number) {
    return this.npcService.findByLocation(locationId);
  }

  /** 单 NPC 详情 GET /api/npc/:id */
  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number) {
    return this.npcService.findOne(id);
  }

  /** 创建对话会话 POST /api/npc/:npcId/session { playerId } → { sessionId, npc } */
  @Post(':npcId/session')
  createSession(
    @Param('npcId', ParseIntPipe) npcId: number,
    @Body() body: { playerId: number },
  ) {
    return this.npcService.createSession(Number(body.playerId), npcId);
  }

  /** 会话内对话 POST /api/npc/session/:sessionId/talk { message } → { reply, callId } */
  @Post('session/:sessionId/talk')
  talkInSession(
    @Param('sessionId', ParseIntPipe) sessionId: number,
    @Body() body: { message?: string },
  ) {
    return this.npcService.talkInSession(sessionId, body.message || '');
  }
}
