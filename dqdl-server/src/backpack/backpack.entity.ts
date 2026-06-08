import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Player } from '../player/player.entity';

/**
 * 背包表 — 每个玩家一个背包，items 为 [{name, count}] JSON 数组
 */
@Entity('backpack')
export class Backpack {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', unique: true })
  player_id: number;

  /** 物品列表 JSON: [{name: "回气丹", count: 5}, ...] */
  @Column({ type: 'text', default: '[]' })
  items: string;

  @ManyToOne(() => Player)
  @JoinColumn({ name: 'player_id' })
  player: Player;
}
