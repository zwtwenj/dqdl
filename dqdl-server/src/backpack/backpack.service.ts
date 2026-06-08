import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Backpack } from './backpack.entity';

export interface BackpackItem {
  name: string;
  count: number;
}

@Injectable()
export class BackpackService {
  constructor(
    @InjectRepository(Backpack)
    private readonly backpackRepo: Repository<Backpack>,
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
}
