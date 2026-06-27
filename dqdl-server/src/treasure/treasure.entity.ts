import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * 宝物定义表（独立于 item）。玩家装备后提供属性加成与被动效果。
 *
 * 与 item 表的关系：每件宝物在 item 表中有一个"物品形态"（无属性，仅作触发），
 * 其 item_id 记录在 `item_id` 字段；玩家从背包使用该物品 → 装备到此宝物栏并销毁物品；
 * 从宝物栏卸下 → 把该物品形态返还背包。
 */
@Entity('treasure')
export class Treasure {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  icon: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** 类型/部位：戒指/靴/镜/甲/饰…（用于"同类限带 N 件"约束） */
  @Column({ type: 'varchar', length: 32, default: '饰品' })
  category: string;

  /** 品阶编码，同功法/斗技：43=黄阶下品 等 */
  @Column({ type: 'int', default: 43 })
  rank: number;

  /** 属性加成 JSON: {power,intelligence,quick,stamina,lucky,hp,energy} */
  @Column({ type: 'text', default: '{}' })
  stats: string;

  /** 被动效果 JSON 数组: [{trigger,type,params}]（后续接战斗引擎） */
  @Column({ type: 'text', nullable: true })
  effects: string | null;

  /** 该 category 同时装备上限；null/0 表示不限 */
  @Column({ type: 'int', nullable: true, comment: '同类装备上限(null=不限)' })
  unique_cat_max: number | null;

  /** 对应 item 表中"物品形态"的 item_id（卸下时返还该物品） */
  @Column({ type: 'varchar', length: 32, nullable: true })
  item_id: string | null;
}
