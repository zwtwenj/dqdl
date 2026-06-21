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

  async create(data: Partial<Skill>): Promise<Skill> {
    return this.repo.save(this.repo.create(data));
  }

  /** 解析 scaling JSON */
  parseScaling(scalingJson: string | null): number[] {
    if (!scalingJson) return [];
    try { return JSON.parse(scalingJson); } catch { return []; }
  }

  /** 解析 effects JSON */
  parseEffects(effectsJson: string | null): string[] {
    if (!effectsJson) return [];
    try { return JSON.parse(effectsJson); } catch { return []; }
  }

  /** 计算伤害: base_damage + scaling[level-1] * attr_val，上下浮动10% */
  calcDamage(skill: Skill, attrVal: number): { min: number; max: number; base: number } {
    const scaling = this.parseScaling(skill.scaling);
    const rate = scaling[skill.level - 1] ?? scaling[scaling.length - 1] ?? 1;
    const base = skill.base_damage + Math.round(rate * attrVal);
    const min = Math.round(base * 0.9);
    const max = Math.round(base * 1.1);
    return { min, max, base };
  }
}
