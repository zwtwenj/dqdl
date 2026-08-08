import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * 故事事件定义表：整个网状故事一条记录。
 *
 * 节点 + 连线都在 nodes JSON 里（不做连接表拆分），结构与 dqdl-agent 的 story 表
 * 同思路：{ start, nodes: { nodeId: { type, title, text, next/choices, action } } }。
 *
 * action 是节点间的游戏动作，挂在节点(narrative.next)或分支(choice.choices[].action)上：
 *   null        → 直接推进
 *   battle      → { kind, mob_id, mob_name, mob_hint } 战斗事件（胜利后推进）
 *   move        → { kind, target_map, target_net_id?, task_name, task_desc, giver_text? }
 *                 移动任务（giver 仅文案不入表，到达后推进）
 *   reward      → { kind, money?, items? } 直接发奖励后推进
 *   dialog      → { kind, lines? } 纯对话演出（预留）
 *
 * 写入方：dqdl_writer 适配阶段（agent 从向量库检索 mob/地图/奖励 → 挂 action）。
 * 读取方：story 模块运行时（按 instance.current_node 读 action → SSE 推前端）。
 */
@Entity('story_event')
export class StoryEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, unique: true })
  story_id: string;

  @Column({ type: 'varchar', length: 64 })
  title: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  theme: string | null;

  @Column({ type: 'json' })
  nodes: any;

  @Column({ type: 'json', nullable: true })
  trigger_config: any; // 事件触发配置 { trigger, params, probability }（配置页 EventTriggers 输出）

  @Column({ type: 'json', nullable: true })
  connect_configs: any; // 连线配置 { "src->tgt": { event, task } }（配置页连线事件输出）

  @Column({ type: 'int', default: 0 })
  endings_count: number;

  @Column({ type: 'int', default: 0 })
  max_depth: number;

  @Column({ type: 'varchar', length: 16, default: 'agent' })
  source: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string; // active=可用 disabled=下架

  @CreateDateColumn()
  created_at: Date;
}
