import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * Buff 定义表（数据驱动）。
 * 效果由 buff_effect 子表描述（hook + fn_id + params），引擎按 fn_id 派发到 buff-library。
 * stat 类（被动面板属性）由 getAttrs 扫描 hook='passive'/fn_id='stat' 直接生效。
 *
 * 字段设计沿用老版本 dqdl-server/src/buff/buff.entity.ts。
 */
@Entity('buff')
export class Buff {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32, comment: 'buff键(引擎/技能引用)' })
  key: string;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({ type: 'varchar', length: 8, default: '✦' })
  icon: string;

  /** buff / debuff / dot / status */
  @Column({ type: 'varchar', length: 16, default: 'buff' })
  type: string;

  @Column({ type: 'int', default: 3, comment: '持续回合(0=永久)' })
  duration: number;

  /** none / refresh / stack */
  @Column({ type: 'varchar', length: 16, default: 'refresh' })
  stack_rule: string;

  @Column({ type: 'int', default: 1 })
  max_stack: number;

  @Column({ type: 'boolean', default: false, comment: '是否快照施法者属性(DNF锁定)' })
  snapshot: boolean;

  @Column({ type: 'int', default: 0, comment: '默认派发优先级' })
  priority: number;

  @Column({ type: 'text', nullable: true, comment: '状态标签JSON(["stun"])' })
  tags: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
