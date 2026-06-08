import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('location_gen_rule')
export class LocationGenRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'tinyint' })
  depth: number; // 这条规则作用于哪一层级

  @Column({ type: 'varchar', length: 32 })
  loc_type: string; // empire / city / wild / sect / district / scene

  @Column({ type: 'int', default: 2 })
  min_children: number;

  @Column({ type: 'int', default: 6 })
  max_children: number;

  @Column({ type: 'varchar', length: 255, comment: '命名风格描述' })
  naming_style: string;

  @Column({ type: 'text', nullable: true, comment: '父节点上下文描述模板' })
  parent_context: string;

  @Column({ type: 'text', nullable: true, comment: '世界观硬约束' })
  world_constraints: string;

  @Column({ type: 'varchar', length: 16, default: '1-3' })
  danger_range: string;

  @Column({ type: 'text', nullable: true, comment: 'AI生成Prompt模板' })
  gen_prompt: string;

  @CreateDateColumn()
  created_at: Date;
}
