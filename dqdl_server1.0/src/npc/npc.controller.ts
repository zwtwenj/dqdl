import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
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

  /** 某地点 NPC 列表 GET /api/npc/location/:locationId?type=node|scene
   *  type=node（默认）→ 玩家站在地图节点上
   *  type=scene       → 玩家进了场景
   *  返回 { static: [], dynamic: [] }：
   *   - static：绑该地点的静态 NPC
   *   - dynamic：启用+存活的动态演员（位置匹配 或 游荡者） */
  @Get('location/:locationId')
  listByLocation(
    @Param('locationId', ParseIntPipe) locationId: number,
    @Query('type') type?: string,
  ) {
    return this.npcService.findByLocation(locationId, type === 'scene' ? 'scene' : 'node');
  }

  /** 单 NPC 详情 GET /api/npc/:id?playerId=xx&npcType=static|dynamic
   *  playerId 可选：传入时按 visible_rule 过滤对话事件（如「交付任务」按玩家任务状态显示）
   *  npcType 可选：static（默认）/ dynamic，区分查哪张表（两表 id 会撞号） */
  @Get(':id')
  one(
    @Param('id', ParseIntPipe) id: number,
    @Query('playerId') playerId?: string,
    @Query('npcType') npcType?: string,
  ) {
    const pid = playerId ? Number(playerId) : undefined;
    const nt = npcType === 'dynamic' ? 'dynamic' : 'static';
    return this.npcService.findOne(id, Number.isFinite(pid) ? pid : undefined, nt);
  }

  /** 创建对话会话 POST /api/npc/:npcId/session { playerId, npcType? } → { sessionId, npc }
   *  npcType：static（默认）/ dynamic，区分 npc_id 指向哪张表 */
  @Post(':npcId/session')
  createSession(
    @Param('npcId', ParseIntPipe) npcId: number,
    @Body() body: { playerId: number; npcType?: string },
  ) {
    const nt = body?.npcType === 'dynamic' ? 'dynamic' : 'static';
    return this.npcService.createSession(Number(body.playerId), npcId, nt);
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
