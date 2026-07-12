import {
  Controller,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PillUseService } from './pill-use.service';
import { PlayerService } from '../player/player.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 丹药接口：使用丹药。
 * 使用在单事务内完成（player 锁行 + 扣背包），返回更新后的 player（含聚合属性）。
 */
@Controller('pill')
@UseGuards(JwtAuthGuard)
export class PillController {
  constructor(
    private readonly pillUseService: PillUseService,
    private readonly playerService: PlayerService,
  ) {}

  /**
   * 使用 1 颗丹药
   * POST /api/pill/:playerId/use { itemId } → { player, remaining }
   * player 为聚合后数据（含 final_attrs/techniques/skills），前端可直接覆盖刷新。
   */
  @Post(':playerId/use')
  async use(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Body() body: { itemId: string },
    @Req() req: any,
  ) {
    await this.playerService.verifyOwnership(playerId, req.user.id);
    const { remaining } = await this.pillUseService.usePill(playerId, body.itemId);
    // 重取聚合后的 player（含 final_attrs 等），供前端整体刷新
    const player = await this.playerService.findOne(playerId);
    return { player, remaining };
  }
}
