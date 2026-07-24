import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 物品模板表：能进入背包的物品统一定义。
 * type 区分类别（丹药/武器/功法/武技/防具/材料/消耗品/特殊/丹方/丹炉/草药...）。
 *
 * 链接字段 ref_type + ref_id：
 *   当某物品在专用表中有更详细的数据时，用 ref_type 指向目标表名，
 *   ref_id 指向目标表的自增 id。背包查询物品详情时按 ref_type 路由到对应表。
 *   例：ref_type='alchemy', ref_id=12 → 反查 alchemy 表 id=12 取草药元素能量等。
 *   ref_type 为 null 表示该物品无外链，仅用本表字段。
 *
 * 背包表(backpack)后续单独建，存玩家持有态（item_id + count）。
 */
@Entity('item')
export class Item {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, comment: '全局唯一ID（dp-/mh-/yb-/pf-/dl- 等）' })
  item_id: string;

  @Column({ type: 'varchar', length: 128, comment: '物品名' })
  name: string;

  @Column({ type: 'varchar', length: 32, comment: '类别：丹药/武器/功法/武技/防具/材料/消耗品/特殊/丹方/丹炉/草药' })
  type: string;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '图标地址' })
  icon: string | null;

  @Column({ type: 'int', default: 0, comment: '参考价格（金币）' })
  price: number;

  @Column({ type: 'text', nullable: true, comment: '描述' })
  description: string | null;

  @Column({ type: 'tinyint', default: 0, comment: '1=可主动使用' })
  usable: number;

  @Column({ type: 'text', nullable: true, comment: '使用效果 JSON：{type,fn|buff,params|scope}' })
  use_effect: string | null;

  /** 元素能量 JSON {木:10,火:5}（草药/材料/魔核用） */
  @Column({ type: 'text', nullable: true })
  element_energy: string | null;

  /** 炼丹品阶(0=非炼丹物) */
  @Column({ type: 'int', default: 0 })
  alchemy_tier: number;

  /** 丹炉规格 JSON {tier,slots,cap,max_durability}（type=丹炉用） */
  @Column({ type: 'text', nullable: true })
  furnace_spec: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '链接目标表名：alchemy/pill_recipe/furnace 等，null=无' })
  ref_type: string | null;

  @Column({ type: 'int', nullable: true, comment: '链接目标表的自增 id，配合 ref_type 使用' })
  ref_id: number | null;

  @CreateDateColumn()
  created_at: Date;
}
