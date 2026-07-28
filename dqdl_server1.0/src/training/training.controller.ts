import { Controller, Post, Get, Query, UseGuards, Req, ParseIntPipe } from '@nestjs/common';
import { TrainingService } from './training.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlayerService } from '../player/player.service';

/**
 * 历练接口：通过 JWT 识别 user → 查 player → 操作历练。
 */
@Controller('training')
@UseGuards(JwtAuthGuard)
export class TrainingController {
  constructor(
    private readonly trainingService: TrainingService,
    private readonly playerService: PlayerService,
  ) {}

  /** 开始历练 POST /api/training/start */
  @Post('start')
  async start(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.trainingService.startTraining(player.id);
  }

  /** 停止历练 POST /api/training/stop */
  @Post('stop')
  async stop(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.trainingService.stopTraining(player.id);
  }

  /** 查当前进行中的历练 + 全部日志 GET /api/training/active
   *  前端初始化用（进入游戏/发起历练后拉全量日志）。 */
  @Get('active')
  async active(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.trainingService.getActiveTraining(player.id);
  }

  /** 增量日志：GET /api/training/logs/new?afterLogId=xxx
   *  返回当前历练中 id > afterLogId 的新日志（无新日志返回空数组）。
   *  前端轮询用：只拉增量，避免重复传输。需玩家处于历练中。 */
  @Get('logs/new')
  async newLogs(
    @Query('afterLogId', ParseIntPipe) afterLogId: number,
    @Req() req: any,
  ) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    const training = await this.trainingService.getActiveTraining(player.id);
    if (!training) return { logs: [], active: false };
    const logs = await this.trainingService.getTrainingLogsAfter(training.id, afterLogId);
    return { logs, active: true, finished: training.status !== 0 };
  }
}
