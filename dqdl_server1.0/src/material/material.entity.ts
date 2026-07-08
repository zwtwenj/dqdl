import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 材料表（图鉴专用）。
 * 仅存"材料本身"的定义——稀有度、来源魔兽、描述等。
 * 与 item 表的关系：item 表中 type='材料' 的行可通过 ref_type='material' + ref_id 指向本表。
 * item_id 为材料全局唯一编码（cl- 前缀），与 item 表的 item_id 对齐。
 *
 * 不使用外键，关联按 item_id 约定。
 */
@Entity('material')
export class Material {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, comment: '材料ID（cl-100），与 item 表 item_id 对齐' })
  item_id: string;

  @Column({ type: 'varchar', length: 64, comment: '材料名' })
  name: string;

  @Column({ type: 'varchar', length: 16, nullable: true, comment: '稀有度：常见/不常见/稀有' })
  rarity: string | null;

  @Column({ type: 'text', nullable: true, comment: '来源魔兽 JSON：[{mob_id,name}]' })
  source_mobs: string | null;

  @Column({ type: 'text', nullable: true, comment: '描述' })
  description: string | null;

  @CreateDateColumn()
  created_at: Date;
}
