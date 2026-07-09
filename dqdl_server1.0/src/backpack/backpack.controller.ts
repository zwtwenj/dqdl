import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { BackpackService } from './backpack.service';
import { PlayerService } from '../player/player.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 背包接口：查询当前角色的背包（含 item 详情聚合）。
 * 通过 JWT 识别 user，再校验 player 归属权（不能查别人背包）。
 */
@Controller('backpack')
@UseGuards(JwtAuthGuard)
export class BackpackController {
  constructor(
    private readonly backpackService: BackpackService,
    private readonly playerService: PlayerService,
  ) {}

  /** 获取玩家背包（含物品详情） GET /api/backpack/:playerId */
  @Get(':playerId')
  async list(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Req() req: any,
  ) {
    await this.playerService.verifyOwnership(playerId, req.user.id);
    return this.backpackService.listByPlayer(playerId);
  }
}
