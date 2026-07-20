import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * 宝物定义表（独立于 item）。玩家装备后提供属性加成与被动效果。
 *
 * 与 item 表的关系：每件宝物在 item 表中有一个"物品形态"（type='宝物',
 * ref_type='treasure', ref_id=宝物id, usable=1），玩家从背包"使用"该物品 →
 * 装备到 player.treasures(JSON [{id,slot}]) 并消耗物品；卸下 → 按 item_id
 * 返还物品形态到背包。
 *
 * stats 字段：{power,intelligence,quick,stamina,lucky,hp,energy}
 *   - 五维(power/intelligence/quick/stamina/lucky)走 final_attrs 加成
 *   - hp/energy 是固定数值加成（不 ×10，避免一件高体质宝物爆血）
 * effects 字段：{cultivation_efficiency:5}（目前只实现修炼效率）
 * unique_cat_max：同 category 装备上限（如戒指类最多 2 件）
 */
@Entity('treasure')
export class Treasure {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 32, default: '饰品' })
  category: string;

  @Column({ type: 'int', default: 43 })
  rank: number;

  @Column({ type: 'varchar', length: 500, default: '{}' })
  stats: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  effects: string | null;

  @Column({ type: 'int', nullable: true, comment: '同类装备上限(null=不限)' })
  unique_cat_max: number | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  item_id: string | null;
}
