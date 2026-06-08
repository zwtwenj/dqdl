import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Player } from '../player/player.entity';

/**
 * 任务表
 * target: [{desc:"击杀青蛙", current:0, required:1}, ...]
 * reward: [{name:"回气丹", count:3}, ...]
 */
@Entity('task')
export class Task {
  @PrimaryGeneratedColumn()
  id: number;

  /** 所属玩家 */
  @Column({ type: 'int' })
  player_id: number;

  /** 任务描述 */
  @Column({ type: 'varchar', length: 255 })
  description: string;

  /** 目标列表 JSON */
  @Column({ type: 'text' })
  target: string;

  /** 奖励物品列表 JSON */
  @Column({ type: 'text' })
  reward: string;

  /** 状态：pending=进行中, completed=已完成, claimed=已领奖 */
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: string;

  @ManyToOne(() => Player)
  @JoinColumn({ name: 'player_id' })
  player: Player;
}
