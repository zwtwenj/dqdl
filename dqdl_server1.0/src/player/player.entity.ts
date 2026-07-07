import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * 玩家表（重构版）：每个 character_id 对应一个 player。
 * location_id 指向全局地图（所有角色共享同一份地图树）。
 * 后续逐步补全属性/修为/功法等玩法字段。
 */
@Entity('player')
export class Player {
  @PrimaryGeneratedColumn()
  id: number;

  /** 所属角色 ID（一个角色一个 player） */
  @Column({ type: 'int', unique: true, comment: '所属角色ID' })
  character_id: number;

  @Column({ type: 'varchar', length: 32, comment: '角色名' })
  name: string;

  @Column({ type: 'int', default: 1, comment: '等级' })
  level: number;

  /** 当前所在地点 ID（全局地图） */
  @Column({ type: 'int', nullable: true, comment: '当前位置 location_id' })
  location_id: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
