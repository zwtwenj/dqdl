import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { BackpackService } from './backpack.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from '../item/item.entity';

@Controller('backpack')
export class BackpackController {
  constructor(
    private readonly backpackService: BackpackService,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
  ) {}

  /** 获取玩家背包（附带物品 description） */
  @Get(':playerId')
  async getByPlayer(@Param('playerId') playerId: number) {
    const bp = await this.backpackService.getByPlayer(playerId);
    const items = this.backpackService.parseItems(bp.items);

    // 批量查询 item 表获取 description
    const names = items.map(i => i.name);
    const dbItems = names.length > 0
      ? await this.itemRepo.createQueryBuilder('item')
          .where('item.name IN (:...names)', { names })
          .getMany()
      : [];
    const descMap = new Map(dbItems.map(i => [i.name, i.description]));

    const enrichedItems = items.map(i => ({
      ...i,
      description: descMap.get(i.name) || '',
    }));

    return {
      ...bp,
      items: enrichedItems,
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
