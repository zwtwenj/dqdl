import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 平面网状地图节点表（与旧 location 树并行的新系统）。
 *
 * 模型：每个节点占据一个整数网格点 (gx, gy)，4 对角方向（NE/NW/SE/SW）邻接，
 * 形成X 形交叉网格。邻接关系完全由网格决定：两节点对角相邻 ⇒ 自动有边。
 *
 * 不使用外键/关系装饰器（遵循项目约定），关联用纯字段表达。
 */
@Entity('location_net')
@Index('uk_grid', ['gx', 'gy'], { unique: true })
@Index('idx_loc_type', ['loc_type'])
export class LocationNet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'varchar', length: 32, comment: 'wild/city/sect/secret' })
  loc_type: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'int', comment: '网格 x（整数坐标）' })
  gx: number;

  @Column({ type: 'int', comment: '网格 y（整数坐标）' })
  gy: number;

  @Column({ type: 'tinyint', default: 1, comment: '1=前沿节点，仍有相邻空位可往外拓' })
  is_frontier: number;

  @Column({ type: 'tinyint', default: 0, comment: '危险等级（野外1-3，其它0）' })
  danger_level: number;

  @Column({ type: 'int', default: 0, comment: '斗气浓郁度（野外用）' })
  qi_density: number;

  @Column({ type: 'json', nullable: true, comment: '特色标签' })
  tags: string[] | null;

  @CreateDateColumn()
  created_at: Date;
}
