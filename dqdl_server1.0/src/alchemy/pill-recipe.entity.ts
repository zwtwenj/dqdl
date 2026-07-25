import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * 丹方表（炼丹配方）。
 * 定义目标元素能量 + 公差。玩家投入材料的元素能量之和须落在 required±tolerance 区间。
 * 不绑定具体材料名——玩家自由组合草药达成目标元素。
 */
@Entity('pill_recipe')
export class PillRecipe {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  recipe_id: string;

  @Column({ type: 'varchar', length: 32 })
  output_item_id: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'int', default: 1 })
  tier: number;

  @Column({ type: 'text' })
  required: string;

  @Column({ type: 'text' })
  tolerance: string;

  @Column({ type: 'int', default: 1 })
  min_furnace_tier: number;

  @Column({ type: 'int', default: 1 })
  base_yield: number;

  @Column({ type: 'int', default: 0 })
  price: number;
}
