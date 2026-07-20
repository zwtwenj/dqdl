import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Treasure } from './treasure.entity';

/**
 * 宝物定义服务：CRUD + stats/effects JSON 解析辅助。
 * 对齐老版本 dqdl-server 的 TreasureService。
 * 不依赖 PlayerService（避免循环依赖）。
 */
@Injectable()
export class TreasureService {
  constructor(
    @InjectRepository(Treasure)
    private readonly repo: Repository<Treasure>,
  ) {}

  async findAll(): Promise<Treasure[]> {
    return this.repo.find();
  }

  async findOne(id: number): Promise<Treasure | null> {
    return this.repo.findOneBy({ id });
  }

  /** 按 id 批量查（用于聚合已装备宝物的定义）。 */
  async findByIds(ids: number[]): Promise<Treasure[]> {
    if (!ids.length) return [];
    return this.repo.find({ where: { id: In(ids) } });
  }

  /** 解析 stats JSON → Record<string, number>。非法返回 {}。 */
  parseStats(statsJson: string | null): Record<string, number> {
    if (!statsJson) return {};
    try {
      const v = JSON.parse(statsJson);
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  }

  /** 解析 effects JSON → Record<string, number>。非法返回 {}。 */
  parseEffects(effectsJson: string | null): Record<string, number> {
    if (!effectsJson) return {};
    try {
      const v = JSON.parse(effectsJson);
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  }
}
