import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pill } from './pill.entity';

/**
 * 丹药查询服务（薄）：仅提供按 item_id 查丹药效果定义。
 * 实际"使用丹药"的事务逻辑见 PillUseService。
 */
@Injectable()
export class PillService {
  constructor(
    @InjectRepository(Pill)
    private readonly repo: Repository<Pill>,
  ) {}

  /** 按 item_id 查丹药效果定义 */
  async findByItemId(itemId: string): Promise<Pill | null> {
    return this.repo.findOneBy({ item_id: itemId });
  }
}
