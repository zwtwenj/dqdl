import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 任务实例表。
 *
 * target / reward / delivery 均为 JSON 字符串（TEXT 列存），约定结构：
 *
 *   target: [{
 *     type: 'fight',              // 目标机制：fight=击杀 / findNpc=找人(预留)
 *     desc: '前往落日草原，击杀焰尾蜥8只',
 *     current: 0,                 // 当前进度
 *     required: 8,                // 需要数量
 *     net_id: 12, net_name: '落日草原',   // 击杀发生地（网状地图节点）
 *     mob_id: 'WB-001', mob_name: '焰尾蜥', // 目标怪
 *   }]
 *
 *   reward: [{ type: 'money', value: 8000 }]   // 或 [{ name: '黑铁剑', count: 1 }]
 *
 *   delivery: { npc_id, npc_name, scene_id, scene_name }   // 在哪个场景/NPC交付
 *
 * 状态机：pending（进行中）→ claimed（已领奖）。达标后仍保持 pending，等玩家回公会交付。
 *
 * 不使用外键/关系装饰器（遵循 location_net / static_npc 规范），player_id 为纯字段。
 */
@Entity('task')
@Index('idx_task_player_status', ['player_id', 'status'])
@Index('idx_task_type', ['type'])
export class Task {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '所属玩家ID → player.id' })
  player_id: number;

  @Column({ type: 'varchar', length: 64, default: '任务' })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'text', comment: '目标JSON' })
  target: string;

  @Column({ type: 'text', comment: '奖励JSON' })
  reward: string;

  @Column({ type: 'varchar', length: 16, default: 'pending', comment: 'pending=进行中 claimed=已领奖' })
  status: string;

  @Column({ type: 'varchar', length: 32, default: 'common', comment: 'common/adventurer' })
  type: string;

  @Column({ type: 'int', default: 1, comment: '星级/危险度（1/2/3）' })
  star: number;

  @Column({ type: 'text', nullable: true, comment: '交付信息JSON' })
  delivery: string | null;

  @Column({ type: 'int', nullable: true, comment: '发布人NPC ID（NULL=系统/接待员，仅存快照）' })
  giver_npc_id: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '发布人NPC名（快照）' })
  giver_npc_name: string | null;

  @CreateDateColumn()
  created_at: Date;
}
