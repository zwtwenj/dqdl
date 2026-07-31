import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 历练实例表：玩家在野外地点发起的一次历练。
 * status: 0=进行中 1=已结束
 * online: 0=在线（agent实时生成日志）/ 1=离线（SSE断开，停agent，重连时汇总补算）
 * 定时器每分钟生成一条 training_log，到 end_time 自动结束。
 */
@Entity('training')
@Index('idx_training_player', ['player_id'])
export class Training {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '玩家ID' })
  player_id: number;

  @Column({ type: 'int', comment: '历练地点ID' })
  location_id: number;

  @Column({ type: 'tinyint', default: 0, comment: '0=进行中 1=已结束' })
  status: number;

  @Column({ type: 'tinyint', default: 0, comment: '0=在线(agent实时) 1=离线(SSE断开)' })
  online: number;

  @Column({ type: 'datetime', precision: 6, nullable: true, comment: 'SSE断线时刻（重连算断线时长用）' })
  offline_at: Date | null;

  @Column({ type: 'datetime', comment: '开始时间' })
  start_time: Date;

  @Column({ type: 'datetime', comment: '结束时间（start + 历练时长）' })
  end_time: Date;

  @CreateDateColumn()
  created_at: Date;
}
