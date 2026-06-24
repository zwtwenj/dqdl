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
}
