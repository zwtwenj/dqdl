import { Controller, Post, Get, UseGuards, Req } from '@nestjs/common';
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

  /** 查当前进行中的历练 + 日志 GET /api/training/active */
  @Get('active')
  async active(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.trainingService.getActiveTraining(player.id);
  }
}
