import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 洞天福地修炼会话表。
 *
 * 玩家进入一个 kind='cultivate' 奇遇（洞天福地）后创建一行，
 * 由 SSE 流定时结算（每轮调 PlayerService.cultivate 增加修为），
 * rounds 达 max_rounds 自动结束；玩家也可主动停止。
 *
 * star 决定修炼倍率（1=×1, 2=×2, 3=×4，对应 BASE_QI 的放大）。
 * status: active=进行中 / stopped=主动停止 / finished=结算完成。
 */
@Entity('cultivation_session')
export class CultivationSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  player_id: number;

  @Column({ type: 'int', nullable: true, comment: '来源奇遇ID' })
  encounter_id: number | null;

  @Column({ type: 'int', comment: '星级(1-3)，决定修炼倍率' })
  star: number;

  @Column({ type: 'int', default: 0, comment: '已结算轮次' })
  rounds: number;

  @Column({ type: 'int', default: 10, comment: '最大轮次' })
  max_rounds: number;

  @Column({ type: 'int', default: 0, comment: '累计获得修为' })
  total_gained: number;

  @Column({ type: 'varchar', length: 16, default: 'active', comment: 'active/stopped/finished' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
