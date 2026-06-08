import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * 功法表
 * rank 编码: 天阶=1x, 地阶=2x, 玄阶=3x, 黄阶=4x; 上品=1, 中品=2, 下品=3
 * 如 43 = 黄阶下品, 21 = 地阶上品
 */
@Entity('technique')
export class Technique {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** 属性：金/木/水/火/土/风/雷 */
  @Column({ type: 'varchar', length: 8 })
  attribute: string;

  /** 品阶编码 */
  @Column({ type: 'int', comment: '品阶: 43=黄阶下品 42=黄阶中品 ... 11=天阶上品' })
  rank: number;

  /** 修为增长速度 */
  @Column({ type: 'int', default: 10, comment: '修为增长速度' })
  growth: number;

  /** 基础属性加成 JSON: {power:5, stamina:5, energy:30} */
  @Column({ type: 'text', nullable: true, comment: '基础属性加成(JSON)' })
  base: string | null;

  /** 功法最大等级 */
  @Column({ type: 'int', default: 3, comment: '功法最大等级' })
  max_level: number;
}
