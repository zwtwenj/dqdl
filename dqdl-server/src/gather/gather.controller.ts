import {
  Controller,
  Get,
  Post,
  Query,
  ParseIntPipe,
  Res,
  Req,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { GatherService } from './gather.service';
import { PlayerService } from '../player/player.service';

/**
 * 采集控制器：野外地点按 tick 自动采集草药（SSE）。
 * 用法与 /training 一致：start → stream → stop。玩家状态 6=采集。
 */
@Controller('gather')
export class GatherController {
  constructor(
    private readonly gatherService: GatherService,
    private readonly playerService: PlayerService,
  ) {}

  /** 单次采集 */
  @Post()
  gather(
    @Query('playerId', ParseIntPipe) playerId: number,
    @Query('locationId', ParseIntPipe) locationId: number,
  ) {
    return this.gatherService.execute(playerId, locationId);
  }

  @Post('start')
  async start(@Query('playerId', ParseIntPipe) playerId: number) {
    return this.gatherService.begin(playerId);
  }

  @Post('stop')
  async stop(@Query('playerId', ParseIntPipe) playerId: number) {
    await this.gatherService.stop(playerId);
    return { success: true };
  }

  @Get('stream')
  async streamGather(
    @Query('playerId', ParseIntPipe) playerId: number,
    @Query('locationId', ParseIntPipe) locationId: number,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const token = this.gatherService.currentToken(playerId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const startTime = Date.now();
    const maxDuration = this.gatherService.gatherMaxDuration;

    res.write(`event: init\ndata: ${JSON.stringify({ interval: this.gatherService.gatherInterval, maxDuration })}\n\n`);

    let running = true;
    req.on('close', () => { running = false; });

    while (running) {
      if (!this.gatherService.isCurrent(playerId, token)) break;

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxDuration) {
        res.write('event: stop\ndata: {}\n\n');
        break;
      }

      const player = await this.playerService.findByIdRaw(playerId);
      if (!player || player.status !== 6) {
        res.write('event: stop\ndata: {}\n\n');
        break;
      }

      try {
        const event = await this.gatherService.execute(playerId, locationId);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (err: any) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
      }

      await new Promise<void>((r) => setTimeout(r, this.gatherService.gatherInterval));
    }

    await this.gatherService.endIfCurrent(playerId, token);
    res.end();
  }
}
