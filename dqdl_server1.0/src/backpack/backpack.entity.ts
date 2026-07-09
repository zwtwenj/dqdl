import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 背包表：玩家对物品的持有态。
 * 一个玩家一个物品一行，count 记录数量；count 归零后应删除该行。
 * (player_id, item_id) 唯一，保证合并写入可用 ON DUPLICATE KEY UPDATE。
 *
 * 与 item 表的关系：item_id 引用 item 表 item_id（无外键，按约定关联）。
 * item 表存物品"定义"（名称/类型/价格/图标/use_effect/ref 路由），
 * backpack 表只存玩家"持有"（哪个玩家、哪个物品、多少个）。
 */
@Entity('backpack')
@Index('idx_backpack_player_item', ['player_id', 'item_id'], { unique: true })
export class Backpack {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '所属玩家ID' })
  player_id: number;

  @Column({ type: 'varchar', length: 32, comment: '物品ID（与 item 表 item_id 对齐）' })
  item_id: string;

  @Column({ type: 'int', default: 1, comment: '持有数量（0 时删除该行）' })
  count: number;

  @CreateDateColumn({ comment: '首次获得时间' })
  acquired_at: Date;

  @UpdateDateColumn({ comment: '最后变更时间' })
  updated_at: Date;
}
