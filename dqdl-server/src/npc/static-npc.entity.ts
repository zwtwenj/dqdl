import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Nature } from './nature.entity';
import { NpcRole } from './npc-role.entity';

/**
 * 静态 NPC 表
 */
@Entity('static_npc')
export class StaticNpc {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({ type: 'varchar', length: 4, default: '男' })
  gender: string;

  @Column({ type: 'varchar', length: 16, default: '中年' })
  age: string;

  @Column({ type: 'int' })
  nature_id: number;

  @Column({ type: 'int' })
  role_id: number;

  @Column({ type: 'int' })
  location_id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  greeting: string | null;

  @ManyToOne(() => Nature)
  @JoinColumn({ name: 'nature_id' })
  nature: Nature;

  @ManyToOne(() => NpcRole)
  @JoinColumn({ name: 'role_id' })
  role: NpcRole;
}
