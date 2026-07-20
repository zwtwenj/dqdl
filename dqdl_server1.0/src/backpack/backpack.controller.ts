import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { BackpackService } from './backpack.service';
import { PlayerService } from '../player/player.service';
import { ItemService } from '../item/item.service';
import { Biz } from '../common/biz.exception';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 背包接口：查询/拖拽/整理。
 * 通过 JWT 识别 user，再校验 player 归属权。
 */
@Controller('backpack')
@UseGuards(JwtAuthGuard)
export class BackpackController {
  constructor(
    private readonly backpackService: BackpackService,
    private readonly playerService: PlayerService,
    private readonly itemService: ItemService,
  ) {}

  /**
   * 获取玩家背包（含物品详情 + 玩家金币）
   * GET /api/backpack/:playerId → { money, slots }
   */
  @Get(':playerId')
  async list(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Req() req: any,
  ) {
    const player = await this.playerService.verifyOwnership(playerId, req.user.id);
    const slots = await this.backpackService.listByPlayer(playerId);
    return { money: player.money, slots };
  }

  /**
   * 拖拽移动物品（交换两个 slot）
   * POST /api/backpack/:playerId/move { fromSlot, toSlot } → { money, slots }
   */
  @Post(':playerId/move')
  async move(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Body() body: { fromSlot: number; toSlot: number },
    @Req() req: any,
  ) {
    await this.playerService.verifyOwnership(playerId, req.user.id);
    const slots = await this.backpackService.moveItem(
      playerId,
      Number(body.fromSlot),
      Number(body.toSlot),
    );
    return { slots };
  }

  /**
   * 整理背包（按 item_id 排序重排 slot）
   * POST /api/backpack/:playerId/sort → { money, slots }
   */
  @Post(':playerId/sort')
  async sort(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Req() req: any,
  ) {
    await this.playerService.verifyOwnership(playerId, req.user.id);
    const slots = await this.backpackService.sortBackpack(playerId);
    return { slots };
  }

  /**
   * 卸下宝物：从 player.treasures 删一条 + 按 treasure.item_id 返还物品形态到背包。
   * POST /api/backpack/:playerId/treasure/unequip { slot } → { player }
   */
  @Post(':playerId/treasure/unequip')
  async unequipTreasure(
    @Param('playerId', ParseIntPipe) playerId: number,
    @Body() body: { slot: number },
    @Req() req: any,
  ) {
    await this.playerService.verifyOwnership(playerId, req.user.id);
    const res = await this.playerService.removeTreasureEntry(playerId, Number(body.slot));
    if (!res) throw Biz.notFound('该槽位无宝物');
    // 按 treasure.item_id 返还物品形态到背包
    if (res.itemId) {
      const item = await this.itemService.findByItemId(res.itemId);
      if (item) {
        await this.backpackService.addItem(playerId, item.item_id, 1, 'treasure_unequip');
      }
    }
    // 重取聚合后的 player（含 final_attrs/treasures），供前端整体刷新
    const player = await this.playerService.findOne(playerId);
    return { player };
  }
}
