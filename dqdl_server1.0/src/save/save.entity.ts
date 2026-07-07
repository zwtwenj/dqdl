import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 存档表。一个账号最多 3 个存档（业务层约束，非 DB 级约束）。
 * content 存游戏存档的完整 JSON（玩家数据、位置、进度等），重构初期可为空对象 {}。
 */
@Entity('save')
@Index('idx_user_slot', ['user_id', 'slot'])
export class Save {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '所属账号 ID' })
  user_id: number;

  @Column({ type: 'tinyint', comment: '存档槽位 1/2/3' })
  slot: number;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '存档名（玩家可自定义）' })
  name: string | null;

  /** 存档内容：玩家数据/位置/进度等任意 JSON，由游戏模块写入 */
  @Column({ type: 'json', comment: '存档内容(JSON)' })
  content: Record<string, any>;

  @CreateDateColumn({ comment: '创建时间' })
  created_at: Date;

  @UpdateDateColumn({ comment: '最后游玩时间' })
  updated_at: Date;
}
