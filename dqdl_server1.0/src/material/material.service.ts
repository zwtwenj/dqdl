import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Material } from './material.entity';

/**
 * 材料服务：提供按 item_id 查询与批量查询（供 mob.drops / 背包解析用）。
 * 暂不接 HTTP 控制器，后续按需补充。
 */
@Injectable()
export class MaterialService {
  constructor(
    @InjectRepository(Material)
    private readonly repo: Repository<Material>,
  ) {}

  /** 按 item_id 查单个 */
  async findByItemId(itemId: string): Promise<Material | null> {
    return this.repo.findOneBy({ item_id: itemId });
  }

  /** 按 item_id 批量查（解析 mob.drops 中 cl- 材料时用） */
  async findByItemIds(itemIds: string[]): Promise<Material[]> {
    if (itemIds.length === 0) return [];
    return this.repo.find({ where: { item_id: In(itemIds) } });
  }

  /** 按 id 查 */
  findOne(id: number): Promise<Material | null> {
    return this.repo.findOneBy({ id });
  }
}
