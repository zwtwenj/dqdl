import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 账号表。一个账号最多 3 个存档（存档数在 save 表用 user_id 关联约束）。
 * password 存 bcrypt 哈希，不存明文。
 */
@Entity('user')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, comment: '登录账号（唯一）' })
  username: string;

  @Column({ type: 'varchar', length: 100, comment: 'bcrypt 密码哈希' })
  password: string;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '昵称（可选）' })
  nickname: string | null;

  @CreateDateColumn({ comment: '注册时间' })
  created_at: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updated_at: Date;
}
