import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Item } from './item.entity';

/**
 * 物品模板服务：提供按 item_id 查询与批量查询。
 * 背包功能后续单独建 backpack 表，此处仅提供物品定义查询。
 */
@Injectable()
export class ItemService {
  constructor(
    @InjectRepository(Item)
    private readonly repo: Repository<Item>,
  ) {}

  /** 按 item_id 查单个 */
  async findByItemId(itemId: string): Promise<Item | null> {
    return this.repo.findOneBy({ item_id: itemId });
  }

  /** 按 item_id 批量查 */
  async findByItemIds(itemIds: string[]): Promise<Item[]> {
    if (itemIds.length === 0) return [];
    return this.repo.find({ where: { item_id: In(itemIds) } });
  }

  /** 按 id 查 */
  findOne(id: number): Promise<Item | null> {
    return this.repo.findOneBy({ id });
  }
}
