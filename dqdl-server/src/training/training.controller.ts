import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Query,
  Res,
  Req,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { TrainingService } from './training.service';
import { PlayerService } from '../player/player.service';

/**
 * 历练控制器（原 LocationController 下的 training / training/stream 路由）。
 * 阶段 1.3：路由前缀由 /location/training(*) 迁移为 /training(*)。
 */
@Controller('training')
export class TrainingController {
  constructor(
    private readonly trainingService: TrainingService,
    private readonly playerService: PlayerService,
  ) {}

  /** 历练事件 */
  @Post()
  training(
    @Query('playerId', ParseIntPipe) playerId: number,
    @Query('locationId', ParseIntPipe) locationId: number,
  ) {
    return this.trainingService.execute(playerId, locationId);
  }

  /** 历练流（SSE） — 自动定时触发历练事件 */
  @Get('stream')
  async streamTraining(
    @Query('playerId', ParseIntPipe) playerId: number,
    @Query('locationId', ParseIntPipe) locationId: number,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const startTime = Date.now();
    const maxDuration = this.trainingService.trainingMaxDuration;

    res.write(`event: init\ndata: ${JSON.stringify({ interval: this.trainingService.trainingInterval, maxDuration })}\n\n`);

    let running = true;
    req.on('close', () => { running = false; });

    while (running) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxDuration) {
        await this.playerService.setStatus(playerId, 1);
        res.write('event: stop\ndata: {}\n\n');
        break;
      }

      const player = await this.playerService.findByIdRaw(playerId);
      if (!player || player.status !== 2) {
        res.write('event: stop\ndata: {}\n\n');
        break;
      }

      try {
        const event = await this.trainingService.execute(playerId, locationId);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (err: any) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
      }

      await new Promise<void>(r => setTimeout(r, this.trainingService.trainingInterval));
    }

    res.end();
  }
}
