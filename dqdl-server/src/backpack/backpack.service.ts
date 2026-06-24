import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Backpack } from './backpack.entity';
import { ItemService } from '../item/item.service';
import { PlayerService } from '../player/player.service';

export interface BackpackItem {
  name: string;
  count: number;
}

@Injectable()
export class BackpackService {
  constructor(
    @InjectRepository(Backpack)
    private readonly backpackRepo: Repository<Backpack>,
    private readonly itemService: ItemService,
    private readonly playerService: PlayerService,
  ) {}

  /** 获取玩家背包（不存在则自动创建） */
  async getByPlayer(playerId: number): Promise<Backpack> {
    let bp = await this.backpackRepo.findOneBy({ player_id: playerId });
    if (!bp) {
      bp = this.backpackRepo.create({ player_id: playerId, items: '[]' });
      bp = await this.backpackRepo.save(bp);
    }
    return bp;
  }

  /** 解析 items JSON */
  parseItems(itemsJson: string): BackpackItem[] {
    try {
      return JSON.parse(itemsJson);
    } catch {
      return [];
    }
  }

  /** 添加物品（同名叠加数量） */
  async addItem(playerId: number, name: string, count: number): Promise<Backpack> {
    const bp = await this.getByPlayer(playerId);
    const items = this.parseItems(bp.items);
    const existing = items.find((i) => i.name === name);
    if (existing) {
      existing.count += count;
    } else {
      items.push({ name, count });
    }
    bp.items = JSON.stringify(items);
    return this.backpackRepo.save(bp);
  }

  /** 移除物品（数量不足则删除条目） */
  async removeItem(playerId: number, name: string, count: number): Promise<Backpack | null> {
    const bp = await this.getByPlayer(playerId);
    const items = this.parseItems(bp.items);
    const idx = items.findIndex((i) => i.name === name);
    if (idx === -1) return null;
    items[idx].count -= count;
    if (items[idx].count <= 0) {
      items.splice(idx, 1);
    }
    bp.items = JSON.stringify(items);
    return this.backpackRepo.save(bp);
  }

  /** 获取玩家背包（附带物品 description/price/usable），供控制器直接返回 */
  async getEnriched(playerId: number): Promise<any> {
    const bp = await this.getByPlayer(playerId);
    const items = this.parseItems(bp.items);
    const names = items.map((i) => i.name);
    const dbItems = names.length > 0 ? await this.itemService.findByNames(names) : [];
    const descMap = new Map(dbItems.map((i) => [i.name, i.description]));
    const priceMap = new Map(dbItems.map((i) => [i.name, i.price]));
    const usableMap = new Map(dbItems.map((i) => [i.name, !!i.usable]));
    const enrichedItems = items.map((i) => ({
      ...i,
      description: descMap.get(i.name) || '',
      price: priceMap.get(i.name) ?? 0,
      usable: usableMap.get(i.name) || false,
    }));
    return { ...bp, items: enrichedItems };
  }

  /** 出售物品：扣背包 + 加金币（售价 = price * 0.5）；金币通过 PlayerService 发放 */
  async sell(playerId: number, name: string, count: number): Promise<any> {
    if (!name || !count || count <= 0) return { error: '参数错误' };

    const dbItem = await this.itemService.findByName(name);
    if (!dbItem) return { error: '物品数据不存在' };
    const sellPrice = Math.floor(dbItem.price * 0.5);
    const totalMoney = sellPrice * count;

    const bp = await this.removeItem(playerId, name, count);
    if (!bp) return { error: '物品不足或不存在' };

    await this.playerService.grantMoney(playerId, totalMoney);
    const player = await this.playerService.findByIdRaw(playerId);

    return {
      ...bp,
      items: this.parseItems(bp.items),
      sold: { name, count, sellPrice, totalMoney },
      money: player?.money ?? 0,
    };
  }
}
