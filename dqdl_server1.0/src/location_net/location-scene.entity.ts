import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 地图内部场景表。
 *
 * 场景属于某个地图节点（net_id → location_net.id），但不显示在地图上。
 * 例如：城市的「坊市 / 佣兵工会 / 炼药师公会」。
 * 玩家在地图上选中城市后，通过场景列表进入具体场景。
 *
 * 同一地图同一类型场景唯一（uk_net_scene）。
 * 不使用外键/关系装饰器（遵循项目约定）。
 */
@Entity('location_scene')
@Index('uk_net_scene', ['net_id', 'scene_type'], { unique: true })
@Index('idx_scene_net', ['net_id'])
export class LocationScene {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '所属地图节点ID → location_net.id' })
  net_id: number;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({
    type: 'varchar',
    length: 32,
    comment: 'market/guild/alchemy/auction/cultivation',
  })
  scene_type: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'json', nullable: true, comment: '可用动作' })
  available_actions: string[] | null;

  @CreateDateColumn()
  created_at: Date;
}
