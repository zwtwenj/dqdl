import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * 静态 NPC 实例表。
 * nature_id/role_id/location_id 为纯字段关联（不使用外键/关系装饰器，遵循 location.entity 规范）。
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

  @CreateDateColumn()
  created_at: Date;
}
