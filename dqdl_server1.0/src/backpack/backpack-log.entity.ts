import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 背包流水日志表：记录每次物品变动（增/减/移动/整理）。
 * 用于审计、排查问题、数据分析。
 */
@Entity('backpack_log')
@Index('idx_bplog_player', ['player_id'])
@Index('idx_bplog_action', ['action'])
@Index('idx_bplog_created', ['created_at'])
export class BackpackLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '玩家ID' })
  player_id: number;

  @Column({ type: 'varchar', length: 32, comment: '物品ID' })
  item_id: string;

  @Column({ type: 'varchar', length: 32, comment: '操作类型：grant/addItem/removeItem/moveItem/sortBackpack/discard/clearByPlayer' })
  action: string;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '操作来源：training_drop/shop_buy/quest_reward/use_item/manual等' })
  source: string | null;

  @Column({ type: 'int', default: 0, comment: '变化数量（正=增加，负=减少，0=移动/整理等无数量变化）' })
  change_amount: number;

  @Column({ type: 'int', nullable: true, comment: '变更前数量（null=之前没有此物品）' })
  count_before: number | null;

  @Column({ type: 'int', nullable: true, comment: '变更后数量（0=已删除该行）' })
  count_after: number | null;

  @Column({ type: 'int', nullable: true, comment: '拖拽：源格位' })
  from_slot: number | null;

  @Column({ type: 'int', nullable: true, comment: '拖拽：目标格位' })
  to_slot: number | null;

  @CreateDateColumn()
  created_at: Date;
}
