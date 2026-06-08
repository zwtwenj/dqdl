import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

@Entity('location')
export class Location {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'varchar', length: 32 })
  loc_type: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'tinyint', default: 0 })
  depth: number;

  @Column({ type: 'tinyint', default: 0 })
  danger_level: number;

  /** 斗气浓郁度 — 仅野外地图有值，公式: random(1.4,1.5)^danger_level * 100 */
  @Column({ type: 'int', default: 0, comment: '斗气浓郁度' })
  qi_density: number;

  @Column({ type: 'tinyint', default: 0, comment: '1=固定节点' })
  is_fixed: number;

  @Column({ type: 'tinyint', default: 0, comment: '1=子节点已生成' })
  is_expanded: number;

  @Column({ type: 'json', nullable: true, comment: '该地点可用的事件类型' })
  available_actions: string[] | null;

  @Column({ type: 'json', nullable: true, comment: '地点特色标签' })
  tags: string[] | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  seed: string | null;

  /** 常见怪物 JSON: [{mob_id, name}] */
  @Column({ type: 'text', nullable: true, comment: '常见怪物列表' })
  common_mobs: string | null;

  @Column({ type: 'int', nullable: true })
  parent_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Location, (loc) => loc.children)
  @JoinColumn({ name: 'parent_id' })
  parent: Location | null;

  @OneToMany(() => Location, (loc) => loc.parent)
  children: Location[];
}
