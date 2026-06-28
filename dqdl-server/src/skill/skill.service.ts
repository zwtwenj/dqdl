import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill } from './skill.entity';

/**
 * 斗技品阶(rank 十位=阶) → 升级修为基数 K。
 * 阶越高(天阶)越难修：天阶1=800, 地阶2=400, 玄阶3=200, 黄阶4=100。
 */
const SKILL_GRADE_K: Record<number, number> = { 1: 800, 2: 400, 3: 200, 4: 100 };

/** 斗技升至下一级所需修为 = K(阶) * 2^(level-1) */
export function skillUpgradeCost(rank: number, level: number): number {
  const grade = Math.floor((rank || 43) / 10);
  const k = SKILL_GRADE_K[grade] ?? 100;
  return k * Math.pow(2, (level || 1) - 1);
}

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

  /**
   * 斗技当前等级下「升至下一级所需修为」。
   * 已是最高级(max_level)时返回 0，表示不可再修炼。
   */
  maxCultivationAtLevel(skill: Skill | null, level: number): number {
    if (!skill) return 0;
    if (skill.max_level && level >= skill.max_level) return 0;
    return skillUpgradeCost(skill.rank, level);
  }
}
