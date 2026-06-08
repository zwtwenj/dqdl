import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { BackpackService } from './backpack.service';

@Controller('backpack')
export class BackpackController {
  constructor(private readonly backpackService: BackpackService) {}

  /** 获取玩家背包 */
  @Get(':playerId')
  async getByPlayer(@Param('playerId') playerId: number) {
    const bp = await this.backpackService.getByPlayer(playerId);
    return {
      ...bp,
      items: this.backpackService.parseItems(bp.items),
    };
  }

  /** 添加物品 */
  @Post(':playerId/add')
  async addItem(
    @Param('playerId') playerId: number,
    @Body() body: { name: string; count: number },
  ) {
    const bp = await this.backpackService.addItem(playerId, body.name, body.count || 1);
    return {
      ...bp,
      items: this.backpackService.parseItems(bp.items),
    };
  }

  /** 移除物品 */
  @Post(':playerId/remove')
  async removeItem(
    @Param('playerId') playerId: number,
    @Body() body: { name: string; count: number },
  ) {
    const bp = await this.backpackService.removeItem(playerId, body.name, body.count || 1);
    if (!bp) return { error: '物品不足或不存在' };
    return {
      ...bp,
      items: this.backpackService.parseItems(bp.items),
    };
  }
}
