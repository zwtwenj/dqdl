import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * 移动实例表：玩家在网状地图上移动的一次记录。
 *
 * 速度 = 玩家 quick（final_attrs.quick，含功法/宝物加成）。
 * 时长(秒) = ceil(距离 × 60 / 速度)。例：quick=10 → 70×60/10 = 420秒 = 7分钟。
 * 生命周期：active(移动中) → arrived(到达) / cancelled(取消)。
 */
@Entity('move_session')
export class MoveSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  player_id: number;

  @Column({ type: 'int' })
  from_net_id: number;

  @Column({ type: 'int' })
  to_net_id: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  from_name: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  to_name: string | null;

  @Column({ type: 'int', default: 70 })
  distance: number;

  @Column({ type: 'int' })
  speed: number;

  @Column({ type: 'int' })
  duration_sec: number;

  @Column({ type: 'datetime', precision: 6 })
  start_at: Date;

  @Column({ type: 'datetime', precision: 6 })
  end_at: Date;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string; // active / arrived / cancelled

  @CreateDateColumn()
  created_at: Date;
}
