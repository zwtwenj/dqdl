import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * 物品表 — 丹药、武器、功法、武技等所有游戏物品
 */
@Entity('item')
export class Item {
  @PrimaryGeneratedColumn()
  id: number;

  /** 全局唯一物品ID，如 mh-h1-1, cl-100 */
  @Column({ type: 'varchar', length: 32, unique: true })
  item_id: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  /** 类别：丹药/武器/功法/武技/防具/材料/消耗品/特殊 等 */
  @Column({ type: 'varchar', length: 32 })
  type: string;

  /** 物品图标（emoji/图片地址），为空时前端使用占位符 */
  @Column({ type: 'varchar', length: 128, nullable: true, comment: '物品图标' })
  icon: string | null;

  @Column({ type: 'int', default: 0, comment: '参考价格（金币）' })
  price: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** 是否可主动使用 */
  @Column({ type: 'boolean', default: false, comment: '是否可使用' })
  usable: boolean;

  /** 使用效果描述 JSON：{ type:'instant'|'buff', fn|buff, params|scope } */
  @Column({ type: 'text', nullable: true, comment: '使用效果描述(JSON)' })
  use_effect: string | null;

  /** 炼丹相关：元素能量向量 JSON，如 {"木":10,"火":5}（草药/材料/魔核用） */
  @Column({ type: 'text', nullable: true, comment: '元素能量向量(JSON)' })
  element_energy: string | null;

  /** 炼丹相关品阶：1/2/3 阶（草药/丹药输出用） */
  @Column({ type: 'int', default: 0, comment: '炼丹品阶(0=非炼丹物)' })
  alchemy_tier: number;

  /** 丹炉规格 JSON：{ tier, slots, cap, max_durability }（type=丹炉 用） */
  @Column({ type: 'text', nullable: true, comment: '丹炉规格(JSON)' })
  furnace_spec: string | null;
}
