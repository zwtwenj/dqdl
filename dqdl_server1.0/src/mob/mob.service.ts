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

  /**
   * 按 level 区间查图鉴魔兽（WB- 前缀），用于秘境按难度选怪。
   * @param lvMin/lvMax 等级区间（含）
   * @param order       level 排序：'DESC' 取该阶最强（boss用），'ASC' 取最弱（普通用）
   */
  async findWBByLevelRange(
    lvMin: number,
    lvMax: number,
    order: 'ASC' | 'DESC' = 'ASC',
  ): Promise<Mob[]> {
    return this.repo
      .createQueryBuilder('m')
      .where('m.mob_id LIKE :prefix', { prefix: 'WB-%' })
      .andWhere('m.level >= :min', { min: lvMin })
      .andWhere('m.level <= :max', { max: lvMax })
      .orderBy('m.level', order)
      .getMany();
  }

  /** 按 id 查 */
  findOne(id: number): Promise<Mob | null> {
    return this.repo.findOneBy({ id });
  }
}
