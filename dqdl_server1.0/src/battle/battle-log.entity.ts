import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 战斗日志表：每场战斗结束（胜/败/逃）写一行，存完整战报。
 * 用于战报回看与后续成就/统计。
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

  /** win / lose / flee */
  @Column({ type: 'varchar', length: 8, default: 'flee', comment: 'win/lose/flee' })
  result: string;

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
