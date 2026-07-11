import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Technique } from './technique.entity';

/**
 * 功法品阶(rank) → 升级修为基数 K。
 * 当前仅配置 43(黄阶下品)=100，其余品阶 K 待补充（返回 0 视为暂不可升级）。
 * 采用配置表形式，便于后续扩展其它品阶。
 */
export const TECHNIQUE_RANK_K: Record<number, number> = {
  43: 100, // 黄阶下品
};

/** 功法升至下一级所需修为 = K(rank) * 2^(level-1) */
export function techniqueUpgradeCost(rank: number, level: number): number {
  const k = TECHNIQUE_RANK_K[rank] ?? 0;
  if (!k) return 0;
  return k * Math.pow(2, level - 1);
}

/** 功法品阶(rank) → 突破初始成功率(%)。仅配置 43(黄阶下品)=80，其余品阶默认 50（待补充） */
export const TECHNIQUE_RANK_SUCCESS: Record<number, number> = { 43: 80 };
export function techniqueBreakthroughBaseRate(rank: number): number {
  return TECHNIQUE_RANK_SUCCESS[rank] ?? 50;
}

@Injectable()
export class TechniqueService {
  constructor(
    @InjectRepository(Technique)
    private readonly repo: Repository<Technique>,
  ) {}

  /** 按 item_id 查单个 */
  async findByItemId(itemId: string): Promise<Technique | null> {
    return this.repo.findOneBy({ item_id: itemId });
  }

  /** 按 item_id 批量查 */
  async findByItemIds(itemIds: string[]): Promise<Technique[]> {
    if (itemIds.length === 0) return [];
    return this.repo.find({ where: { item_id: In(itemIds) } });
  }

  async findAll(): Promise<Technique[]> {
    return this.repo.find({ order: { rank: 'ASC' } });
  }

  /** 按主键批量查找（功法装配列表用） */
  async findByIds(ids: number[]): Promise<Technique[]> {
    if (!ids.length) return [];
    return this.repo.find({ where: { id: In(ids) } });
  }

  /** 按 id 查 */
  findOne(id: number): Promise<Technique | null> {
    return this.repo.findOneBy({ id });
  }

  async create(data: Partial<Technique>): Promise<Technique> {
    return this.repo.save(this.repo.create(data));
  }

  /**
   * 解析功法 base：新结构为 [{level, params, max_cultivation}]，按等级取该级 params；兼容旧的扁平对象。
   * @param level 玩家当前功法等级，默认 1
   */
  parseBase(baseJson: string | null, level = 1): Record<string, number> {
    const entry = this.baseEntryAtLevel(baseJson, level);
    if (entry) return (entry.params as Record<string, number>) || {};
    // 兼容旧的扁平对象
    if (!baseJson) return {};
    try {
      const data = JSON.parse(baseJson);
      return typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  }

  /** 取 base 数组中指定等级的原始条目（含 params / max_cultivation） */
  baseEntryAtLevel(baseJson: string | null, level = 1): any | null {
    if (!baseJson) return null;
    let data: any;
    try {
      data = JSON.parse(baseJson);
    } catch {
      return null;
    }
    if (!Array.isArray(data)) return null;
    return (
      data.find((e: any) => Number(e?.level) === level) ??
      data.find((e: any) => Number(e?.level) === 1) ??
      null
    );
  }

  /**
   * 玩家当前功法等级下「升至下一级所需修为」：
   * 优先取 base 中该等级条目声明的 max_cultivation（功法定义，数据驱动）；
   * 条目缺失时退回到公式 K(rank) * 2^(level-1)。
   * 已是最高级时 base 中 max_cultivation 为 0（表示不可再升）。
   */
  maxCultivationAtLevel(technique: Technique | null, level: number): number {
    const entry = technique ? this.baseEntryAtLevel(technique.base, level) : null;
    if (entry && entry.max_cultivation != null && entry.max_cultivation !== '') {
      return Number(entry.max_cultivation) || 0;
    }
    return technique ? techniqueUpgradeCost(technique.rank, level) : 0;
  }
}
