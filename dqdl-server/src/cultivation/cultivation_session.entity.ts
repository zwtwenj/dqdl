import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/** 洞天福地修炼会话（玩家进入后定时结算修为） */
@Entity('cultivation_session')
export class CultivationSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '玩家ID' })
  player_id: number;

  @Column({ type: 'int', nullable: true, comment: '来源奇遇ID' })
  encounter_id: number | null;

  /** 星级 1-3，决定修炼倍率（1=×1, 2=×2, 3=×4） */
  @Column({ type: 'int', comment: '星级(1-3)' })
  star: number;

  @Column({ type: 'int', default: 0, comment: '已结算轮次' })
  rounds: number;

  @Column({ type: 'int', default: 10, comment: '最大轮次' })
  max_rounds: number;

  @Column({ type: 'int', default: 0, comment: '累计获得修为' })
  total_gained: number;

  @Column({ type: 'varchar', length: 16, default: 'active', comment: '状态: active/stopped/finished' })
  status: string;

  @CreateDateColumn({ comment: '创建时间' })
  created_at: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updated_at: Date;
}
