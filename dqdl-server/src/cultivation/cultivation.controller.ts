import { Controller, Get, Post, Query, ParseIntPipe, Res, Req, NotFoundException } from '@nestjs/common';
import type { Response, Request } from 'express';
import { CultivationService } from './cultivation.service';

@Controller('cultivation')
export class CultivationController {
  constructor(private readonly cultivationService: CultivationService) {}

  /** 进入洞天福地（由奇遇进入） */
  @Post('enter')
  enter(
    @Query('playerId', ParseIntPipe) playerId: number,
    @Query('encounterId', ParseIntPipe) encounterId: number,
  ) {
    return this.cultivationService.enter(playerId, encounterId);
  }

  /** 当前进行中的修炼会话 */
  @Get('current')
  async current(@Query('playerId', ParseIntPipe) playerId: number) {
    const s = await this.cultivationService.getCurrent(playerId);
    if (!s) throw new NotFoundException('没有进行中的修炼');
    return s;
  }

  /** 主动停止修炼 */
  @Post('stop')
  async stop(@Query('playerId', ParseIntPipe) playerId: number) {
    await this.cultivationService.stop(playerId);
    return { ok: true };
  }

  /** 修炼 SSE 流：每 interval 结算一次，达到 max_rounds 自动结束 */
  @Get('stream')
  async stream(
    @Query('playerId', ParseIntPipe) playerId: number,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`event: init\ndata: ${JSON.stringify({ interval: this.cultivationService.interval })}\n\n`);

    let running = true;
    req.on('close', () => { running = false; });

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
    res.end();
  }
}
