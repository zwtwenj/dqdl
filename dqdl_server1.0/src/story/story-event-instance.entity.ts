import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 故事事件运行实例表：一条 = 玩家一次触发。
 *
 * 记录演出进度：current_node（当前节点）、node_path（走过的链路）、status。
 * 运行时推进：server 读 story_event.nodes 的当前节点 action →
 *   封装原子化事件 → SSE(story_event) 推前端 → 前端执行动作 → advance 更新 current_node。
 *
 * 生命周期：触发 → INSERT(pending, current_node=start) → 演出推进(playing，更新 current_node/node_path)
 *           → 走到结局节点 → UPDATE status=done。
 * 与 script_instance（剧本实例）互补：剧本走 SSE 演出；story_event 走"节点+动作"事件流。
 */
@Entity('story_event_instance')
export class StoryEventInstance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  event_id: number;

  @Column({ type: 'int' })
  player_id: number;

  @Column({ type: 'varchar', length: 32, nullable: true })
  current_node: string | null;

  @Column({ type: 'json', nullable: true })
  node_path: string[] | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: string; // pending=待触发 playing=演出中 done=已结束 abandoned=已放弃

  @Column({ type: 'int', nullable: true })
  from_status: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
