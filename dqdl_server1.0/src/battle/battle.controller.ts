import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { BattleService } from './battle.service';
import { PlayerService } from '../player/player.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 战斗接口：所有接口通过 JWT 识别 user，再推导 player（与 training 模块同款）。
 *
 * POST /api/battle/start   { mobId }  开始战斗（固定测试怪由前端传 mobId）
 * POST /api/battle/action  { type, slot }  玩家行动（normal/skill/flee）
 * GET  /api/battle/state              查询当前战斗快照
 * POST /api/battle/flee               逃跑（直接结束）
 */
@Controller('battle')
@UseGuards(JwtAuthGuard)
export class BattleController {
  constructor(
    private readonly battleService: BattleService,
    private readonly playerService: PlayerService,
  ) {}

  /** 开始战斗 */
  @Post('start')
  async start(@Body() body: { mobId: string }, @Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.battleService.start(player.id, body?.mobId || 'WB-001');
  }

  /** 玩家行动 */
  @Post('action')
  async action(@Body() body: { type: 'normal' | 'skill' | 'flee'; slot?: number }, @Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.battleService.action(player.id, body);
  }

  /** 查询当前战斗快照（兼恢复/清理：会话在则返回，孤儿状态则清 IDLE） */
  @Get('state')
  async state(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.battleService.resumeOrClean(player.id);
  }

  /** 逃跑 */
  @Post('flee')
  async flee(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.battleService.flee(player.id);
  }
}
