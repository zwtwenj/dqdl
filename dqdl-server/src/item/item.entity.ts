import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * 物品表 — 丹药、武器、功法、武技等所有游戏物品
 */
@Entity('item')
export class Item {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  /** 类别：丹药/武器/功法/武技/防具/材料/消耗品/特殊 等 */
  @Column({ type: 'varchar', length: 32 })
  type: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
