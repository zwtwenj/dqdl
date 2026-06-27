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

  /** 开始历练：由后端校验并置玩家为历练中（状态由后端统一管理，前端不再直接改 status） */
  @Post('start')
  async start(
    @Query('playerId', ParseIntPipe) playerId: number,
  ) {
    return this.trainingService.begin(playerId);
  }

  /** 停止历练：由后端立即恢复玩家为空闲，并使旧 SSE 流失效 */
  @Post('stop')
  async stop(@Query('playerId', ParseIntPipe) playerId: number) {
    await this.trainingService.stop(playerId);
    return { success: true };
  }

  /** 历练流（SSE） — 自动定时触发历练事件。状态生命周期由 start/stop/本流的断开兜底共同管理 */
  @Get('stream')
  async streamTraining(
    @Query('playerId', ParseIntPipe) playerId: number,
    @Query('locationId', ParseIntPipe) locationId: number,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    // 记录本流对应的会话令牌；若未被 start 建立则为 0（下方循环会立即退出）
    const token = this.trainingService.currentToken(playerId);

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
      // 被新的 start/stop 取代 → 本流静默退出，状态归新会话所有
      if (!this.trainingService.isCurrent(playerId, token)) break;

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxDuration) {
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

    // 本流结束：仅当仍是当前会话（未被新 start/stop 取代）才恢复空闲。
    // 这也是客户端断开/刷新/崩溃时，后端唯一的兜底回收路径。
    await this.trainingService.endIfCurrent(playerId, token);

    res.end();
  }
}
