import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Backpack } from './backpack.entity';
import { ItemService } from '../item/item.service';
import { PlayerService } from '../player/player.service';

export interface BackpackItem {
  name: string;
  count: number;
}

/** NPC 商店固定出售的物品主键 ID（无数量限制，售价 = item.price） */
export const SHOP_ITEM_IDS = [595, 596];

@Injectable()
export class BackpackService {
  private readonly logger = new Logger(BackpackService.name);

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

  /** 添加物品（同名叠加数量）—— 物品必须在 item 表中存在，否则拒绝写入 */
  async addItem(playerId: number, name: string, count: number): Promise<Backpack> {
    const dbItem = await this.itemService.findByName(name);
    if (!dbItem) {
      // 背包数据不允许超出 item 表：未知物品直接丢弃，仅记录日志
      this.logger.warn(`拒绝向玩家 ${playerId} 背包写入未知物品：${name}`);
      return this.getByPlayer(playerId);
    }

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

  /** 获取玩家背包（附带物品 icon/description/price/usable），供控制器直接返回 */
  async getEnriched(playerId: number): Promise<any> {
    const bp = await this.getByPlayer(playerId);
    const items = this.parseItems(bp.items);
    const names = items.map((i) => i.name);
    const dbItems = names.length > 0 ? await this.itemService.findByNames(names) : [];
    const descMap = new Map(dbItems.map((i) => [i.name, i.description]));
    const priceMap = new Map(dbItems.map((i) => [i.name, i.price]));
    const usableMap = new Map(dbItems.map((i) => [i.name, !!i.usable]));
    const iconMap = new Map(dbItems.map((i) => [i.name, i.icon]));
    const enrichedItems = items.map((i) => ({
      ...i,
      icon: iconMap.get(i.name) || null,
      description: descMap.get(i.name) || '',
      price: priceMap.get(i.name) ?? 0,
      usable: usableMap.get(i.name) || false,
    }));
    return { ...bp, items: enrichedItems };
  }

  /** NPC 商店出售列表（无数量限制，售价 = item.price） */
  async getShopItems(): Promise<any[]> {
    const items = await this.itemService.findByIds(SHOP_ITEM_IDS);
    // 保持配置中的展示顺序
    const byId = new Map(items.map((i) => [i.id, i]));
    const result: any[] = [];
    for (const id of SHOP_ITEM_IDS) {
      const i = byId.get(id);
      if (!i) continue;
      result.push({
        id: i.id,
        name: i.name,
        icon: i.icon || null,
        type: i.type,
        price: i.price,
        description: i.description || '',
      });
    }
    return result;
  }

  /** 购买商店物品：扣金币 + 入背包（数量无上限，单价 = item.price） */
  async buy(playerId: number, itemId: number, count: number): Promise<any> {
    if (!itemId || !count || count <= 0) return { error: '参数错误' };

    const dbItem = await this.itemService.findOne(itemId);
    if (!dbItem) return { error: '物品不存在' };

    const totalCost = dbItem.price * count;
    const player = await this.playerService.findByIdRaw(playerId);
    if (!player) return { error: '玩家不存在' };
    if ((player.money ?? 0) < totalCost) return { error: '金币不足' };

    // 先扣款，再入包（addItem 已内置 item 表校验）
    await this.playerService.grantMoney(playerId, -totalCost);
    await this.addItem(playerId, dbItem.name, count);

    const freshPlayer = await this.playerService.findByIdRaw(playerId);
    const enriched = await this.getEnriched(playerId);
    return {
      items: enriched.items,
      bought: { name: dbItem.name, count, price: dbItem.price, totalCost },
      money: freshPlayer?.money ?? 0,
    };
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

  /** 卸下宝物：从宝物栏移除并重算属性，把"物品形态"返还背包 */
  async unequipTreasure(playerId: number, slot: number): Promise<any> {
    const res = await this.playerService.removeTreasureEntry(playerId, slot);
    if (!res) throw new BadRequestException('该槽位没有宝物');
    if (res.itemId) {
      const item = await this.itemService.findByItemId(res.itemId);
      if (item) await this.addItem(playerId, item.name, 1);
    }
    return this.playerService.findOne(playerId);
  }
}
