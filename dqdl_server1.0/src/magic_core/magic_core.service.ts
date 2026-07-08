import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { MagicCore } from './magic_core.entity';

/**
 * 魔核服务：提供按 item_id 查询与批量查询（供 mob.drops / 背包解析用）。
 * 暂不接 HTTP 控制器，后续按需补充。
 */
@Injectable()
export class MagicCoreService {
  constructor(
    @InjectRepository(MagicCore)
    private readonly repo: Repository<MagicCore>,
  ) {}

  /** 按 item_id 查单个 */
  async findByItemId(itemId: string): Promise<MagicCore | null> {
    return this.repo.findOneBy({ item_id: itemId });
  }

  /** 按 item_id 批量查（解析 mob.drops 中 mh- 魔核时用） */
  async findByItemIds(itemIds: string[]): Promise<MagicCore[]> {
    if (itemIds.length === 0) return [];
    return this.repo.find({ where: { item_id: In(itemIds) } });
  }

  /** 按 id 查 */
  findOne(id: number): Promise<MagicCore | null> {
    return this.repo.findOneBy({ id });
  }
}
