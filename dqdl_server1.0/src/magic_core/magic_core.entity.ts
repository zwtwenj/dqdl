import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 魔核表（图鉴专用）。
 * 魔核是魔兽体内斗气精华的凝结，按属性、阶位(tier)、品质(quality)三级分类。
 * 仅存"魔核本身"的定义——属性/品阶/品质/外观/掉落来源/参考价格/用途。
 * 与 item 表的关系：item 表中 type='魔核' 的行可通过 ref_type='magic_core' + ref_id 指向本表。
 * item_id 为魔核全局唯一编码（mh- 前缀），与 item 表的 item_id 对齐。
 *
 * 不使用外键，关联按 item_id 约定。
 */
@Entity('magic_core')
export class MagicCore {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, comment: '魔核ID（mh-h1-1），与 item 表 item_id 对齐' })
  item_id: string;

  @Column({ type: 'varchar', length: 64, comment: '魔核名' })
  name: string;

  @Column({ type: 'varchar', length: 8, comment: '属性：火/冰/风/土/雷/暗/毒/水' })
  attribute: string;

  @Column({ type: 'tinyint', comment: '品阶：1/2/3（一阶/二阶/三阶）' })
  tier: number;

  @Column({ type: 'varchar', length: 8, comment: '品质：劣质/普通/优质' })
  quality: string;

  @Column({ type: 'text', nullable: true, comment: '外观描述' })
  appearance: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '掉落来源描述' })
  drop_source: string | null;

  @Column({ type: 'int', default: 0, comment: '最低参考价（金币）' })
  price_min: number;

  @Column({ type: 'int', default: 0, comment: '最高参考价（金币）' })
  price_max: number;

  @Column({ type: 'text', nullable: true, comment: '用途描述' })
  usage_desc: string | null;

  @CreateDateColumn()
  created_at: Date;
}
