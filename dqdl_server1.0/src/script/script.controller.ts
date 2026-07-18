import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Response } from 'express';
import { ScriptSseService } from './script-sse.service';
import { ScriptTriggerService } from './script-trigger.service';
import { PlayerService } from '../player/player.service';

/**
 * 剧本接口。
 *
 * 鉴权：JWT（SSE 走 ?token= query，EventSource 无法设 header；与修炼室 SSE 一致）。
 *
 * GET /api/script/stream            剧本触发 SSE 长连接。
 * GET /api/script/instance/:id/node 获取某剧本实例的当前节点（含映射NPC信息）。
 */
@Controller('script')
@UseGuards(JwtAuthGuard)
export class ScriptController {
  constructor(
    private readonly sse: ScriptSseService,
    private readonly scriptTrigger: ScriptTriggerService,
    private readonly playerService: PlayerService,
  ) {}

  /**
   * 剧本触发 SSE 流。
   * 连接建立后注册到连接池；ScriptTrigger 命中时通过池子推送 event:trigger。
   * 客户端断开时（close/网络中断）自动从池中移除。
   */
  @Get('stream')
  async stream(@Req() req: any, @Res() res: Response) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    const playerId = player.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // 初始握手消息（让前端确认连接成功）
    res.write(`event: init\ndata: ${JSON.stringify({ playerId })}\n\n`);

    // 注册到连接池（含 30s 心跳）
    this.sse.register(playerId, res);

    // 客户端断开时清理
    const closeHandler = () => {
      this.sse.unregister(playerId);
    };
    res.on('close', closeHandler);
  }

  /**
   * 获取某剧本实例的当前节点完整信息（前端收到 SSE 准备完成通知后调此接口）。
   * 返回 lines/choices/location/actors（含映射后的真实 NPC 信息）。
   * 校验：归属当前玩家 + status=playing。
   */
  @Get('instance/:id/node')
  async getCurrentNode(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.scriptTrigger.getCurrentNode(Number(id), player.id);
  }
}
