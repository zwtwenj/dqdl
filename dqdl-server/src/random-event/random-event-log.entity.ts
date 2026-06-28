import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * 随机事件触发记录 / 事件总线：每玩家每事件去重的依据，并留存状态与过程，支持刷新后恢复进行中的事件。
 * status: started=已触发 / in_progress=进行中 / ended=已结束
 * process: 对话快照 JSON { messages, choices, ended, path }，用于页面刷新后恢复
 */
@Entity('random_event_log')
@Index('idx_player_event', ['player_id', 'event_id'])
@Index('idx_player_status', ['player_id', 'status'])
export class RandomEventLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '玩家ID' })
  player_id: number;

  @Column({ type: 'varchar', length: 64, comment: '随机事件 event_id' })
  event_id: string;

  @Column({ type: 'varchar', length: 16, default: 'started', comment: '状态: started/in_progress/ended' })
  status: string;

  /** 对话快照 JSON（messages/choices/ended/path），刷新后据此恢复 */
  @Column({ type: 'text', nullable: true, comment: '对话快照(JSON)' })
  process: string | null;

  @CreateDateColumn({ comment: '触发时间' })
  created_at: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updated_at: Date;
}

