import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 管理员账号表（独立于游戏的 user 表，互不干扰）。
 * 由管理平台后端 synchronize 自动建表，首次启动幂等创建默认 admin/123456。
 */
@Entity('admin_users')
export class AdminUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  username: string;

  @Column({ type: 'varchar', length: 100, comment: 'bcrypt 哈希' })
  password: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  nickname: string | null;

  @CreateDateColumn()
  created_at: Date;
}
