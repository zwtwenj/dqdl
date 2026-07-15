import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * 静态 NPC 实例表。
 * nature_id/role_id 为纯字段关联（不使用外键/关系装饰器，遵循 location.entity 规范）。
 *
 * 绑定位置（两列互斥，只有一个有值）：
 *   location_id          → 绑定地图节点（location_net.id）：玩家站在节点上能见到（如野外 NPC）
 *   location_scene_id    → 绑定场景（location_scene.id）：玩家进该场景能见到（如公会接待员）
 *
 * 之所以分两列：原 location_id 一列混存节点id和场景id，语义混淆且 id 会撞号。
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

  @Column({ type: 'int', nullable: true, comment: '绑定的地图节点id（与 location_scene_id 互斥）' })
  location_id: number | null;

  @Column({ type: 'int', nullable: true, comment: '绑定的场景id（与 location_id 互斥）' })
  location_scene_id: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  greeting: string | null;

  @CreateDateColumn()
  created_at: Date;
}
