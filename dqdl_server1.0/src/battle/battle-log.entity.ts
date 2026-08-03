import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 战斗日志表：战斗开始即写一行（status=active，含进行中快照），结束标记 finished。
 * 进行中状态持久化（player_state/mob_state/log）供刷新/断线还原当前回合。
 * 历史行（status=finished）用于战报回看与统计。
 */
@Entity('battle_log')
@Index('idx_battle_log_player', ['player_id'])
export class BattleLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '玩家ID' })
  player_id: number;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '怪物图鉴ID' })
  mob_id: string | null;

  @Column({ type: 'varchar', length: 64, default: '', comment: '怪物名' })
  mob_name: string;

  /** win / lose / flee（结束时填） */
  @Column({ type: 'varchar', length: 8, default: 'flee', comment: 'win/lose/flee' })
  result: string;

  /** active=进行中 / finished=已结束 */
  @Column({ type: 'varchar', length: 16, default: 'finished', comment: 'active=进行中 finished=已结束' })
  status: string;

  /** 玩家战斗快照 JSON（hp/energy/buffs/skills），进行中每回合更新 */
  @Column({ type: 'text', nullable: true, comment: '玩家战斗快照JSON' })
  player_state: string | null;

  /** 怪物战斗快照 JSON（hp/buffs），进行中每回合更新 */
  @Column({ type: 'text', nullable: true, comment: '怪物战斗快照JSON' })
  mob_state: string | null;

  /** 来源状态（还原时参考，如秘境中=3） */
  @Column({ type: 'int', default: 1, comment: '来源状态(还原时参考)' })
  from_status: number;

  @Column({ type: 'int', default: 0, comment: '回合数' })
  rounds: number;

  @Column({ type: 'text', nullable: true, comment: '完整战报(叙事文本)' })
  log: string | null;

  @Column({ type: 'int', default: 0, comment: '结束时玩家剩余血量' })
  player_hp: number;

  @Column({ type: 'int', default: 0, comment: '结束时怪物剩余血量' })
  mob_hp: number;

  @Column({ type: 'datetime', precision: 6, nullable: true, comment: '战斗开始时间' })
  started_at: Date | null;

  @Column({ type: 'datetime', precision: 6, default: () => 'CURRENT_TIMESTAMP(6)', comment: '战斗结束时间' })
  ended_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
