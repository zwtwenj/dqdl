import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * 地点表：全局唯一地图树（网游模式，所有角色共享）。
 * 固定种子在服务启动时初始化（斗气大陆 → 区域）。
 * 后续层数接入 AI 懒生成时复用同一张表，子节点按需展开。
 *
 * 不使用外键/关系装饰器，父子关系用 parent_id 字段表达。
 */
@Entity('location')
export class Location {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'varchar', length: 32, comment: 'continent/region/empire/city/wild/sect/secret/district/scene' })
  loc_type: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'tinyint', default: 0 })
  depth: number;

  @Column({ type: 'tinyint', default: 0, comment: '危险等级（野外1-3，其它0）' })
  danger_level: number;

  @Column({ type: 'int', default: 0, comment: '斗气浓郁度（野外用）' })
  qi_density: number;

  @Column({ type: 'tinyint', default: 0, comment: '1=固定节点' })
  is_fixed: number;

  @Column({ type: 'tinyint', default: 0, comment: '1=子节点已生成' })
  is_expanded: number;

  @Column({ type: 'json', nullable: true, comment: '可用动作' })
  available_actions: string[] | null;

  @Column({ type: 'json', nullable: true, comment: '特色标签' })
  tags: string[] | null;

  @Column({ type: 'text', nullable: true, comment: '常见魔兽 JSON：[{mob_id,name}]' })
  common_mobs: string | null;

  @Column({ type: 'text', nullable: true, comment: '常见药草 JSON：[{item_id,name}]' })
  common_herbs: string | null;

  @Column({ type: 'int', nullable: true })
  parent_id: number | null;

  @CreateDateColumn()
  created_at: Date;
}
