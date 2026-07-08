import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Mob } from './mob.entity';

/**
 * 魔兽服务：提供图鉴查询与按 mob_id 批量查询（供 location.common_mobs 解析）。
 * 暂不接 HTTP 控制器，后续按需补充。
 */
@Injectable()
export class MobService {
  constructor(
    @InjectRepository(Mob)
    private readonly repo: Repository<Mob>,
  ) {}

  /** 按 mob_id 查单个 */
  async findByMobId(mobId: string): Promise<Mob | null> {
    return this.repo.findOneBy({ mob_id: mobId });
  }

  /** 按 mob_id 批量查（解析 location.common_mobs 时用） */
  async findByMobIds(mobIds: string[]): Promise<Mob[]> {
    if (mobIds.length === 0) return [];
    return this.repo.find({ where: { mob_id: In(mobIds) } });
  }

  /** 按 id 查 */
  findOne(id: number): Promise<Mob | null> {
    return this.repo.findOneBy({ id });
  }
}
