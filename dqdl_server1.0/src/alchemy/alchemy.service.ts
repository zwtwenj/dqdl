import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Alchemy } from './alchemy.entity';

/**
 * 草药服务：提供按 item_id 查询与批量查询（供 location.common_herbs 解析）。
 * 暂不接 HTTP 控制器，后续按需补充。
 */
@Injectable()
export class AlchemyService {
  constructor(
    @InjectRepository(Alchemy)
    private readonly repo: Repository<Alchemy>,
  ) {}

  /** 按 item_id 查单个 */
  async findByItemId(itemId: string): Promise<Alchemy | null> {
    return this.repo.findOneBy({ item_id: itemId });
  }

  /** 按 item_id 批量查（解析 location.common_herbs 时用） */
  async findByItemIds(itemIds: string[]): Promise<Alchemy[]> {
    if (itemIds.length === 0) return [];
    return this.repo.find({ where: { item_id: In(itemIds) } });
  }

  /** 按 id 查 */
  findOne(id: number): Promise<Alchemy | null> {
    return this.repo.findOneBy({ id });
  }
}
