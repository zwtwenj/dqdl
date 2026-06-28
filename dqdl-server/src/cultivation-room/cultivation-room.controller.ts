import { Controller, Get, Post, Query, ParseIntPipe, Res, Req, NotFoundException } from '@nestjs/common';
import type { Response, Request } from 'express';
import { CultivationRoomService } from './cultivation-room.service';

@Controller('cultivation-room')
export class CultivationRoomController {
  constructor(private readonly service: CultivationRoomService) {}

  /** 档位信息（一/二/三阶修炼室的费用与斗气浓郁度） */
  @Get('config')
  config() {
    return this.service.getOptions();
  }

  /** 进入修炼室（选择档位 + 修炼类型：qi=斗气, technique=功法[需 targetId], skill=斗技[需 targetId]） */
  @Post('enter')
  enter(
    @Query('playerId', ParseIntPipe) playerId: number,
    @Query('tier', ParseIntPipe) tier: number,
    @Query('mode') mode: string,
    @Query('targetId') targetId?: string,
  ) {
    return this.service.enter(playerId, tier, mode, targetId ? Number(targetId) : undefined);
  }

  /** 当前进行中的修炼室会话 */
  @Get('current')
  async current(@Query('playerId', ParseIntPipe) playerId: number) {
    const s = await this.service.getCurrent(playerId);
    if (!s) throw new NotFoundException('没有进行中的修炼');
    return s;
  }

  /** 主动停止修炼 */
  @Post('stop')
  async stop(@Query('playerId', ParseIntPipe) playerId: number) {
    await this.service.stop(playerId);
    return { ok: true };
  }

  /** 修炼 SSE 流：每 interval 结算一次（扣金币+涨修为）；金币不足/修满/停止时结束 */
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

    res.write(`event: init\ndata: ${JSON.stringify({ interval: this.service.interval })}\n\n`);

    let running = true;
    req.on('close', () => { running = false; });

    while (running) {
      const session = await this.service.getCurrent(playerId);
      if (!session) { res.write('event: stop\ndata: {}\n\n'); break; }
      try {
        const result = await this.service.settle(playerId);
        if (!result) { res.write('event: stop\ndata: {}\n\n'); break; }
        res.write(`data: ${JSON.stringify(result)}\n\n`);
        if (result.finished) { res.write('event: stop\ndata: {}\n\n'); break; }
      } catch (err: any) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
        break;
      }
      await new Promise<void>((r) => setTimeout(r, this.service.interval));
    }
    // 流结束兜底：若会话仍 active（如客户端断开/刷新），回收会话并恢复玩家状态，避免卡在「室内修炼」
    await this.service.abortActive(playerId);
    res.end();
  }
}
