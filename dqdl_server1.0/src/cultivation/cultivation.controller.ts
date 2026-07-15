import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { CultivationService } from './cultivation.service';
import { PlayerService } from '../player/player.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 洞天福地修炼接口。
 *
 *   POST /enter          进入（消耗 cultivate 奇遇，建会话，置 CULTIVATING）
 *   GET  /current        查当前进行中的修炼会话
 *   POST /stop           主动停止
 *   GET  /stream         SSE 流：每 interval 结算一轮，到 max_rounds 自动结束
 *
 * 鉴权：JWT（普通接口走 header；SSE 流走 ?token= query，EventSource 无法设 header）。
 */
@Controller('cultivation')
@UseGuards(JwtAuthGuard)
export class CultivationController {
  constructor(
    private readonly cultivationService: CultivationService,
    private readonly playerService: PlayerService,
  ) {}

  /** 进入洞天福地 POST /api/cultivation/enter { encounterId } */
  @Post('enter')
  async enter(@Body() body: { encounterId?: number }, @Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    if (!body.encounterId) return { code: 1, message: '缺少 encounterId' };
    const session = await this.cultivationService.enter(player.id, body.encounterId);
    return { ...session, interval: this.cultivationService.interval };
  }

  /** 当前进行中的修炼会话 GET /api/cultivation/current */
  @Get('current')
  async current(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.cultivationService.getCurrent(player.id);
  }

  /** 主动停止修炼 POST /api/cultivation/stop */
  @Post('stop')
  async stop(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    await this.cultivationService.stop(player.id);
    return { ok: true };
  }

  /** 修炼 SSE 流：每 interval 结算一次，达到 max_rounds 自动结束。
   *  token 走 ?token= query（JwtStrategy 已支持），EventSource 无法设 header。
   *  流断开（客户端关闭/刷新）时 abortActive 兜底回收会话。 */
  @Get('stream')
  async stream(@Req() req: any, @Res() res: Response) {
    // 先校验归属（JwtAuthGuard 已验证 token，这里取 player）
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    const playerId = player.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`event: init\ndata: ${JSON.stringify({ interval: this.cultivationService.interval })}\n\n`);

    let running = true;
    const closeHandler = () => { running = false; };
    req.on('close', closeHandler);

    while (running) {
      const session = await this.cultivationService.getCurrent(playerId);
      if (!session) { res.write('event: stop\ndata: {}\n\n'); break; }
      try {
        const result = await this.cultivationService.settle(playerId);
        if (!result) { res.write('event: stop\ndata: {}\n\n'); break; }
        res.write(`data: ${JSON.stringify(result)}\n\n`);
        if (result.finished) { res.write('event: stop\ndata: {}\n\n'); break; }
      } catch (err: any) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
        break;
      }
      await new Promise<void>((r) => setTimeout(r, this.cultivationService.interval));
    }
    // 流结束兜底：若会话仍 active（客户端断开/刷新/崩溃），回收会话并恢复玩家为空闲
    req.off('close', closeHandler);
    await this.cultivationService.abortActive(playerId);
    res.end();
  }
}
