import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill } from './skill.entity';

@Injectable()
export class SkillService {
  constructor(
    @InjectRepository(Skill)
    private readonly repo: Repository<Skill>,
  ) {}

  async findAll(): Promise<Skill[]> {
    return this.repo.find({ order: { rank: 'ASC' } });
  }

  async findOne(id: number): Promise<Skill | null> {
    return this.repo.findOneBy({ id });
  }

  /** 按 id 批量查询（供战斗引擎解析已装备斗技） */
  async findByIds(ids: number[]): Promise<Skill[]> {
    if (!ids.length) return [];
    return this.repo.find({ where: ids.map((id) => ({ id }) as any) });
  }

  async create(data: Partial<Skill>): Promise<Skill> {
    return this.repo.save(this.repo.create(data));
  }

  /** 解析 effects JSON */
  parseEffects(effectsJson: string | null): string[] {
    if (!effectsJson) return [];
    try { return JSON.parse(effectsJson); } catch { return []; }
  }
}
