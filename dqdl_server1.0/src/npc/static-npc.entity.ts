import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * 静态 NPC 实例表。
 * nature_id/role_id/location_id 为纯字段关联（不使用外键/关系装饰器，遵循 location.entity 规范）。
 *
 * location_id 语义：指向 location_scene.id（新网状地图体系的"场景"：
 * 佣兵工会/炼药师公会/坊市 等）。玩家进入某场景时，按 location_id=scene.id 查该场景的 NPC。
 */
@Entity('static_npc')
export class StaticNpc {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({ type: 'varchar', length: 4, default: '男' })
  gender: string;

  @Column({ type: 'varchar', length: 16, default: '中年' })
  age: string;

  @Column({ type: 'int' })
  nature_id: number;

  @Column({ type: 'int' })
  role_id: number;

  @Column({ type: 'int' })
  location_id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  greeting: string | null;

  @CreateDateColumn()
  created_at: Date;
}
