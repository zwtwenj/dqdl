import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * 事件实例：每玩家每事件的会话状态与对话快照。
 * status: started=已触发 / in_progress=进行中 / ended=已结束
 * process: 对话快照 JSON { messages, choices, ended, path }，用于页面刷新后恢复
 *
 * 来源有两种：
 *  1) 手工模板/概率事件经 check() 命中后写入；
 *  2) agent 编排的事件经派发队列(event_dispatch)转写为本表记录后弹出。
 */
@Entity('event_instance')
@Index('idx_player_event', ['player_id', 'event_id'])
@Index('idx_player_status', ['player_id', 'status'])
export class EventInstance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '玩家ID' })
  player_id: number;

  @Column({ type: 'varchar', length: 64, comment: '事件 event_id' })
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
