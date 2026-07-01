import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * 丹方表 —— 炼丹配方。
 * 炼制时把投入材料的 element_energy 求和，逐元素与 [required - tolerance, required + tolerance] 比较，
 * 全部命中即成丹；任一越界或超出丹炉单元素 cap 即失败（材料全部消耗）。
 */
@Entity('pill_recipe')
export class PillRecipe {
  @PrimaryGeneratedColumn()
  id: number;

  /** 全局丹方ID，如 pf-001 */
  @Column({ type: 'varchar', length: 32, unique: true })
  recipe_id: string;

  /** 产出丹药的 item_id（须先存在于 item 表） */
  @Column({ type: 'varchar', length: 32 })
  output_item_id: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  /** 品阶 1/2/3 */
  @Column({ type: 'int', default: 1 })
  tier: number;

  /** 目标元素能量 JSON，如 {"木":20,"火":10} */
  @Column({ type: 'text', comment: '目标元素能量(JSON)' })
  required: string;

  /** 每元素公差 JSON，如 {"木":4,"火":2} */
  @Column({ type: 'text', comment: '元素公差(JSON)' })
  tolerance: string;

  /** 所需最低丹炉品阶 */
  @Column({ type: 'int', default: 1, comment: '最低丹炉品阶' })
  min_furnace_tier: number;

  /** 基础产量 */
  @Column({ type: 'int', default: 1 })
  base_yield: number;

  /** 向 NPC 学习此丹方的价格 */
  @Column({ type: 'int', default: 0, comment: '学习价格(金币)' })
  price: number;
}
