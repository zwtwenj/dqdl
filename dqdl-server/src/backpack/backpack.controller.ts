import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { BackpackService } from './backpack.service';
import { ItemUseService } from '../item/item-use.service';

/**
 * 背包控制器（阶段 1.4 瘦身后）：
 * 不再注入任何 Repository、不再发起跨表 SQL；
 * enrichment / sell 逻辑下沉到 BackpackService，控制器仅做 HTTP 转发。
 */
@Controller('backpack')
export class BackpackController {
  constructor(
    private readonly backpackService: BackpackService,
    private readonly itemUseService: ItemUseService,
  ) {}

  /** 获取玩家背包（附带物品 description 和 price） */
  @Get(':playerId')
  getByPlayer(@Param('playerId') playerId: number) {
    return this.backpackService.getEnriched(Number(playerId));
  }

  /** 添加物品 */
  @Post(':playerId/add')
  async addItem(
    @Param('playerId') playerId: number,
    @Body() body: { name: string; count: number },
  ) {
    const bp = await this.backpackService.addItem(Number(playerId), body.name, body.count || 1);
    return { ...bp, items: this.backpackService.parseItems(bp.items) };
  }

  /** 移除物品 */
  @Post(':playerId/remove')
  async removeItem(
    @Param('playerId') playerId: number,
    @Body() body: { name: string; count: number },
  ) {
    const bp = await this.backpackService.removeItem(Number(playerId), body.name, body.count || 1);
    if (!bp) return { error: '物品不足或不存在' };
    return { ...bp, items: this.backpackService.parseItems(bp.items) };
  }

  /** 出售物品：扣背包 + 加金币（售价 = price * 0.5） */
  @Post(':playerId/sell')
  sellItem(
    @Param('playerId') playerId: number,
    @Body() body: { name: string; count: number },
  ) {
    return this.backpackService.sell(Number(playerId), body.name, body.count);
  }

  /** 使用物品：校验背包拥有 → 结算效果(共享) → 扣背包 1 */
  @Post(':playerId/use')
  async useItem(
    @Param('playerId') playerId: number,
    @Body() body: { name: string },
  ) {
    const { name } = body;
    if (!name) return { error: '参数错误' };

    const bp = await this.backpackService.getByPlayer(Number(playerId));
    const items = this.backpackService.parseItems(bp.items);
    const slot = items.find((i) => i.name === name);
    if (!slot || slot.count <= 0) return { error: '背包中没有该物品' };

    const outcome = await this.itemUseService.applyUseEffect(Number(playerId), name);
    if (!outcome.ok) return { error: outcome.error };

    await this.backpackService.removeItem(Number(playerId), name, 1);

    const freshBp = await this.backpackService.getByPlayer(Number(playerId));
    return {
      used: { name, message: outcome.message },
      player: outcome.player,
      items: this.backpackService.parseItems(freshBp.items),
    };
  }
}
