import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * 场景事件模板（数据驱动：触发条件 + 概率 + 节点图回调）。
 * conditions / nodes 为 JSON 文本，由 service 解析。
 *
 * source 区分手工配置(manual)与 agent 动态编排(agent)。
 * trigger_kind 区分触发方式：probabilistic(玩家动作后概率roll) / push(agent 强制塞入派发队列)。
 */
@Entity('event_template')
export class EventTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64, unique: true, comment: '事件键(代码/i18n引用)' })
  event_id: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({
    type: 'varchar',
    length: 32,
    comment: '触发类型: enter_location / breakthrough / deliver_task ...',
  })
  trigger_type: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0, comment: '满足条件后的触发概率 0~1' })
  chance: number;

  @Column({ type: 'text', comment: '触发条件 JSON' })
  conditions: string;

  @Column({ type: 'text', comment: '分支对话+effect 节点图 JSON' })
  nodes: string;

  @Column({ type: 'int', default: 0, comment: '同时命中时的优先级(大优先)' })
  weight: number;

  /** 是否仅触发一次(每玩家)：true 时查 event_instance 去重 */
  @Column({ type: 'tinyint', default: 0, comment: '是否每玩家仅触发一次' })
  once: number;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '特殊逻辑 handler 名(可选)' })
  handler: string | null;

  @Column({ type: 'tinyint', default: 1, comment: '是否启用' })
  enabled: number;

  @Column({ type: 'varchar', length: 16, default: 'manual', comment: '来源: manual/agent' })
  source: string;

  @Column({ type: 'varchar', length: 16, default: 'probabilistic', comment: '触发方式: probabilistic(概率roll)/push(强制塞)' })
  trigger_kind: string;

  @CreateDateColumn({ comment: '创建时间' })
  created_at: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updated_at: Date;
}
