import {
  Controller,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ItemUseService } from './item-use.service';
import { PlayerService } from '../player/player.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 物品接口：通用使用物品（丹药/宝物等，按 item.type 分发）。
 *
 * POST /api/item/:playerId/use { itemId, targetSlot? } → { player, remaining }
 *   player 为聚合后数据（含 final_attrs/treasures），前端可直接覆盖刷新。
 *   targetSlot 仅宝物装备时用：拖拽到指定槽位（1~5）。丹药忽略此参数。
 */
@Controller('item')
@UseGuards(JwtAuthGuard)
export class ItemController {
  constructor(
    private readonly itemUseService: ItemUseService,
    private readonly playerService: PlayerService,
  ) {}

  /**
   * 使用 1 个物品（丹药/宝物等）。
   * 按 item.type 分发效果，单事务扣背包+应用效果，返回聚合后的 player。
   */
  @Post(':playerId/use')
  async use(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Body() body: { itemId: string; targetSlot?: number },
    @Req() req: any,
  ) {
    await this.playerService.verifyOwnership(playerId, req.user.id);
    const { remaining } = await this.itemUseService.useItem(playerId, body.itemId, body.targetSlot);
    // 重取聚合后的 player（含 final_attrs/treasures），供前端整体刷新
    const player = await this.playerService.findOne(playerId);
    return { player, remaining };
  }
}
