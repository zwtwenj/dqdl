import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 动态 NPC 演员池实例表。
 *
 * 与 static_npc 的区别：
 *  - location_net_id / location_scene_id 两列皆可空：空 = 游荡演员，
 *    enabled=1 时可在任意地图/场景出现（findByLocation 会一并返回游荡演员）。
 *  - enabled（启停开关）+ status（alive/dead/left 生命周期）两套独立状态，
 *    两者正交：死掉的演员 enabled 即便为 1，acquire/地点查询都不会命中。
 *  - 默认不绑 dialog_session/shop/task；后续若需让动态 NPC 开店/交付任务再扩展。
 *
 * nature_id / role_id 为纯字段关联（不使用关系装饰器，遵循本目录 entity 规范）。
 * role_id 多指向 npc_role.category='profession' 的动态职业，但也不禁止指向静态职能。
 */
@Entity('dynamic_npc')
export class DynamicNpc {
  @PrimaryGeneratedColumn()
  id: number;

  // ── 身份 ──
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

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  // ── 启用/状态 ──
  @Column({ type: 'tinyint', default: 1, comment: '1=启用(可出场); 0=停用' })
  enabled: number;

  @Column({ type: 'varchar', length: 16, default: 'alive' })
  status: string; // alive / dead / left

  // ── 位置（可移动；两列皆空 = 游荡演员）──
  @Column({ type: 'int', nullable: true, comment: '当前所在地图节点 → location_net.id' })
  location_net_id: number | null;

  @Column({ type: 'int', nullable: true, comment: '当前所在场景 → location_scene.id' })
  location_scene_id: number | null;

  // ── 来源追溯 ──
  @Column({ type: 'varchar', length: 16, default: 'agent' })
  source: string; // agent / manual / script

  @Column({ type: 'varchar', length: 32, nullable: true })
  ref_type: string | null;

  @Column({ type: 'int', nullable: true })
  ref_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
