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

  /** 查全部（供炼丹材料目录/商店用） */
  async findAll(): Promise<Item[]> {
    return this.repo.find();
  }

  /** 按 item_id 查单个 */
  async findByItemId(itemId: string): Promise<Item | null> {
    return this.repo.findOneBy({ item_id: itemId });
  }

  /** 按 item_id 批量查 */
  async findByItemIds(itemIds: string[]): Promise<Item[]> {
    if (itemIds.length === 0) return [];
    return this.repo.find({ where: { item_id: In(itemIds) } });
  }

  /**
   * 按类别 + 名称关键词查物品（用于秘境按难度选魔核奖励）。
   * 例：type='魔核', keyword='一阶' → 命中所有名称含"一阶"的魔核。
   */
  async findByTypeAndNameKeyword(type: string, keyword: string): Promise<Item[]> {
    return this.repo
      .createQueryBuilder('i')
      .where('i.type = :type', { type })
      .andWhere('i.name LIKE :kw', { kw: `%${keyword}%` })
      .getMany();
  }

  /** 按 id 查 */
  findOne(id: number): Promise<Item | null> {
    return this.repo.findOneBy({ id });
  }
}
