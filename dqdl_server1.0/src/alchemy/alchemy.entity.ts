import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 草药表（炼丹原料）。
 * 仅存"草药本身"的定义——元素能量、产地、药效等。
 * 与 item 表的关系：item 表中 type='草药' 的行可通过 ref_type='alchemy' + ref_id 指向本表。
 * item_id 为草药全局唯一编码（yb- 前缀），与 item 表的 item_id 对齐。
 *
 * 不使用外键，关联按 item_id 约定。
 */
@Entity('alchemy')
export class Alchemy {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, comment: '草药ID（yb-001）' })
  item_id: string;

  @Column({ type: 'varchar', length: 64, comment: '草药名' })
  name: string;

  @Column({ type: 'tinyint', default: 1, comment: '品阶 1/2/3' })
  tier: number;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '分类' })
  category: string | null;

  @Column({ type: 'text', nullable: true, comment: '元素能量 JSON：{"木":10,"火":5}' })
  element: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true, comment: '稀有度' })
  rarity: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true, comment: '产地' })
  habitat: string | null;

  @Column({ type: 'text', nullable: true, comment: '外观描述' })
  appearance: string | null;

  @Column({ type: 'text', nullable: true, comment: '药效描述' })
  effect: string | null;

  @Column({ type: 'int', default: 0, comment: '参考价格（金币）' })
  price: number;

  @CreateDateColumn()
  created_at: Date;
}
