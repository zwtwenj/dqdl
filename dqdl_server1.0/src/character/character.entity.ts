import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 角色表（网游模式：一个账号最多 3 个角色）。
 * 一个角色对应一个 player（玩家游戏数据）。
 * 全局地图所有角色共享，角色数据里不存地图。
 */
@Entity('character')
@Index('idx_user_slot', ['user_id', 'slot'])
export class Character {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '所属账号 ID' })
  user_id: number;

  @Column({ type: 'tinyint', comment: '角色序号 1/2/3' })
  slot: number;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '角色名（玩家自定义）' })
  name: string | null;

  /** 角色扩展数据（预留，后续存装备/功法进度等） */
  @Column({ type: 'json', nullable: true, comment: '角色扩展数据(JSON)' })
  content: Record<string, any> | null;

  @CreateDateColumn({ comment: '创建时间' })
  created_at: Date;

  @UpdateDateColumn({ comment: '最后游玩时间' })
  updated_at: Date;
}
