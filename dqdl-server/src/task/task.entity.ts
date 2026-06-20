import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Player } from '../player/player.entity';

/**
 * 任务表
 * target: [{desc:"击杀青蛙", current:0, required:1}, ...]
 * reward: [{type:"money", value:10000}, ...] 或 [{name:"回气丹", count:3}, ...]
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

  /** 奖励列表 JSON */
  @Column({ type: 'text' })
  reward: string;

  /** 状态：pending=进行中, completed=已完成, claimed=已领奖 */
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: string;

  /** 任务类型：adventurer=佣兵公会任务, common=普通任务 */
  @Column({ type: 'varchar', length: 32, default: 'common' })
  type: string;

  /** 任务星级（冒险任务 = 危险度 1/2/3） */
  @Column({ type: 'int', default: 1 })
  star: number;

  /** 交付信息 JSON: { npc_id, npc_name, location_path, location_label }
   *  location_path: 前往交付地点的路径节点数组 */
  @Column({ type: 'text', nullable: true })
  delivery: string | null;

  @CreateDateColumn({ comment: '创建时间' })
  created_at: Date;

  @ManyToOne(() => Player)
  @JoinColumn({ name: 'player_id' })
  player: Player;
}
