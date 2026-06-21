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

  /** 获取玩家背包（附带物品 description 和 price） */
  @Get(':playerId')
  async getByPlayer(@Param('playerId') playerId: number) {
    const bp = await this.backpackService.getByPlayer(playerId);
    const items = this.backpackService.parseItems(bp.items);

    const names = items.map(i => i.name);
    const dbItems = names.length > 0
      ? await this.itemRepo.createQueryBuilder('item')
          .where('item.name IN (:...names)', { names })
          .getMany()
      : [];
    const descMap = new Map(dbItems.map(i => [i.name, i.description]));
    const priceMap = new Map(dbItems.map(i => [i.name, i.price]));

    const enrichedItems = items.map(i => ({
      ...i,
      description: descMap.get(i.name) || '',
      price: priceMap.get(i.name) ?? 0,
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

  /** 出售物品：扣背包 + 加金币（售价 = price * 0.5） */
  @Post(':playerId/sell')
  async sellItem(
    @Param('playerId') playerId: number,
    @Body() body: { name: string; count: number },
  ) {
    const { name, count } = body;
    if (!name || !count || count <= 0) return { error: '参数错误' };

    // 1. 查物品原价
    const dbItem = await this.itemRepo.findOneBy({ name });
    if (!dbItem) return { error: '物品数据不存在' };
    const sellPrice = Math.floor(dbItem.price * 0.5);
    const totalMoney = sellPrice * count;

    // 2. 从背包移除
    const bp = await this.backpackService.removeItem(playerId, name, count);
    if (!bp) return { error: '物品不足或不存在' };

    // 3. 加金币
    await this.itemRepo.manager
      .createQueryBuilder()
      .update('player', { money: () => `money + ${totalMoney}` })
      .where('id = :id', { id: playerId })
      .execute();

    // 4. 查最新金币
    const player = await this.itemRepo.manager
      .createQueryBuilder()
      .select('money')
      .from('player', 'p')
      .where('p.id = :id', { id: playerId })
      .getRawOne();

    return {
      ...bp,
      items: this.backpackService.parseItems(bp.items),
      sold: { name, count, sellPrice, totalMoney },
      money: player?.money ?? 0,
    };
  }
}
