import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Mob } from './mob.entity';

@Injectable()
export class MobService {
  constructor(
    @InjectRepository(Mob)
    private readonly mobRepo: Repository<Mob>,
  ) {}

  /** 根据 mob_id 查找，不存在则创建 */
  async findOrCreate(mobId: string, name?: string, description?: string): Promise<Mob> {
    let mob = await this.mobRepo.findOneBy({ mob_id: mobId });
    if (!mob) {
      mob = this.mobRepo.create({
        mob_id: mobId,
        name: name || null,
        description: description || null,
        power: 0,
        intelligence: 0,
        quick: 0,
        stamina: 0,
        level: 0,
      });
      mob = await this.mobRepo.save(mob);
    }
    return mob;
  }

  /** 批量查找或创建，返回按输入顺序的结果 */
  async findOrCreateBatch(
    items: { mob_id: string; name?: string; description?: string }[],
  ): Promise<Mob[]> {
    const results: Mob[] = [];
    for (const item of items) {
      const mob = await this.findOrCreate(item.mob_id, item.name, item.description);
      results.push(mob);
    }
    return results;
  }

  async findAll(): Promise<Mob[]> {
    return this.mobRepo.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number): Promise<Mob | null> {
    return this.mobRepo.findOneBy({ id });
  }

  async findByMobId(mobId: string): Promise<Mob | null> {
    return this.mobRepo.findOneBy({ mob_id: mobId });
  }
}
