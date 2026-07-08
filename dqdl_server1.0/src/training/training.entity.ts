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
 * 定时器每 10s 生成一条 training_log，到 end_time 自动结束。
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

  @Column({ type: 'datetime', comment: '开始时间' })
  start_time: Date;

  @Column({ type: 'datetime', comment: '结束时间（start + 历练时长）' })
  end_time: Date;

  @CreateDateColumn()
  created_at: Date;
}
