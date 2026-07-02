import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * 事件派发队列：agent 编排产出的事件在此排队，由感知层在条件满足时转为 event_instance 弹给玩家。
 *
 * delivery 投递策略：
 *  - immediate      编排完成后立即转 instance，玩家下次 GET /event/current 或 resumeInProgress 时弹出
 *  - enter_location 玩家进入匹配 fire_conditions 的地点时，由 check() 触发转写
 *  - condition_met  通用条件满足时触发（与 enter_location 类似，留作扩展）
 *
 * status: pending=待派发 / fired=已转为实例 / discarded=已丢弃
 * title/nodes 为编排时刻快照，避免后续 template 被改动影响已排队事件。
 */
@Entity('event_dispatch')
@Index('idx_player_status', ['player_id', 'status'])
@Index('idx_fire_at', ['fire_at'])
export class EventDispatch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '目标玩家ID' })
  player_id: number;

  @Column({ type: 'varchar', length: 64, comment: '关联 event_template.event_id' })
  event_id: string;

  @Column({ type: 'varchar', length: 128, comment: '事件标题快照' })
  title: string;

  @Column({ type: 'text', comment: '节点图 JSON 快照' })
  nodes: string;

  @Column({ type: 'varchar', length: 16, default: 'immediate', comment: '投递策略: immediate/enter_location/condition_met' })
  delivery: string;

  /** 派发条件 JSON: { locType?, locationId?, minLevel? } */
  @Column({ type: 'text', nullable: true, comment: '派发条件 JSON' })
  fire_conditions: string | null;

  /** 可选：定时派发时间（惰性检查时按此时间触发） */
  @Column({ type: 'datetime', nullable: true, comment: '定时派发时间(可空)' })
  fire_at: Date | null;

  @Column({ type: 'varchar', length: 16, default: 'pending', comment: '状态: pending/fired/discarded' })
  status: string;

  @Column({ type: 'varchar', length: 16, default: 'agent', comment: '来源: agent/manual' })
  source: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '编排理由(调试用)' })
  reason: string | null;

  @CreateDateColumn({ comment: '入队时间' })
  created_at: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updated_at: Date;
}
