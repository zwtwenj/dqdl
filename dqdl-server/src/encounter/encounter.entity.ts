import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/** 奇遇（目前仅 dungeon 一种；后续可扩展 event/quest 等 kind） */
@Entity('encounter')
export class Encounter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '玩家ID' })
  player_id: number;

  @Column({ type: 'varchar', length: 32, default: 'dungeon', comment: '奇遇类型: dungeon' })
  kind: string;

  @Column({ type: 'varchar', length: 32, comment: '场景类型(山洞/密林/山谷/浅滩)' })
  scene_type: string;

  /** 星级 1-3（仅 cultivate 奇遇，决定修炼倍率） */
  @Column({ type: 'int', nullable: true, comment: '星级(仅cultivate奇遇,1-3)' })
  star: number | null;

  @Column({ type: 'varchar', length: 64, comment: '奇遇标题' })
  title: string;

  @Column({ type: 'varchar', length: 256, comment: '触发描述' })
  description: string;

  @Column({ type: 'varchar', length: 16, default: 'pending', comment: '状态: pending/entered/abandoned' })
  status: string;

  @CreateDateColumn({ comment: '创建时间' })
  created_at: Date;
}
