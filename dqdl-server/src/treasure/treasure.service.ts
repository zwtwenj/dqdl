import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Treasure } from './treasure.entity';

@Injectable()
export class TreasureService {
  constructor(
    @InjectRepository(Treasure)
    private readonly repo: Repository<Treasure>,
  ) {}

  async findAll(): Promise<Treasure[]> {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number): Promise<Treasure | null> {
    return this.repo.findOneBy({ id });
  }

  async findByIds(ids: number[]): Promise<Treasure[]> {
    if (!ids.length) return [];
    return this.repo.find({ where: { id: ids as any } });
  }

  parseStats(statsJson: string | null): Record<string, number> {
    if (!statsJson) return {};
    try { const v = JSON.parse(statsJson); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  }

  /** 解析宝物被动效果 JSON：如 { cultivation_efficiency: 5 } */
  parseEffects(effectsJson: string | null): Record<string, number> {
    if (!effectsJson) return {};
    try { const v = JSON.parse(effectsJson); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  }
}
