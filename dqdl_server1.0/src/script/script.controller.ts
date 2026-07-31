import { Controller, Get, Param, Post, Body, Query, Req, Res } from '@nestjs/common';
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
 * GET  /api/script/stream                剧本触发 SSE 长连接。
 * GET  /api/script/instance/:id/node     获取某剧本实例的当前节点（含映射NPC信息）。
 * POST /api/script/instance/:id/advance  推进剧本（选选项跳到目标节点）。
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

    // 客户端断开时清理 + 通知订阅者（如 TrainingService 离线结算）
    const closeHandler = () => {
      this.sse.unregister(playerId);
      this.sse.notifyDisconnect(playerId);
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

  /**
   * 推进剧本：玩家选某选项后，跳到目标节点。
   * Body: { goto }  目标节点 id（必须是当前节点 choices 里的合法目标）
   * 返回新节点完整信息（同 getCurrentNode 结构）。
   */
  @Post('instance/:id/advance')
  async advance(
    @Param('id') id: string,
    @Body() body: { goto: string },
    @Req() req: any,
  ) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.scriptTrigger.advanceInstance(Number(id), player.id, body?.goto);
  }
}
