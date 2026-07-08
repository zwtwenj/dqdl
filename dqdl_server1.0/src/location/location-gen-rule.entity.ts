import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 地点生成规则表：按 depth 存各层的 AI 生成 prompt 模板与约束。
 * 调 agent /generate/map 时，按父节点 depth+1 查对应规则，作为 rule 参数传入。
 */
@Entity('location_gen_rule')
@Index('idx_gen_rule_depth', ['depth'])
export class LocationGenRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'tinyint', comment: '适用于该深度的子节点（父节点 depth+1 = 此值）' })
  depth: number;

  @Column({ type: 'varchar', length: 32, comment: '期望生成的 loc_type（mixed 表示混合）' })
  loc_type: string;

  @Column({ type: 'tinyint', default: 2, comment: '最少子节点数' })
  min_children: number;

  @Column({ type: 'tinyint', default: 6, comment: '最多子节点数' })
  max_children: number;

  @Column({ type: 'varchar', length: 255, comment: '命名风格描述' })
  naming_style: string;

  @Column({ type: 'varchar', length: 16, comment: '危险等级范围，如 1-3' })
  danger_range: string;

  @Column({ type: 'text', comment: '世界观约束' })
  world_constraints: string;

  @Column({ type: 'text', comment: '生成 prompt 模板（含占位符）' })
  gen_prompt: string;

  @CreateDateColumn()
  created_at: Date;
}
