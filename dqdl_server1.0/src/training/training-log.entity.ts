import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 历练日志表：历练过程中每 10s 生成一条叙事。
 * content 为 agent /generate/training 生成的 150 字叙事文本。
 * mob_id 存遭遇的魔兽ID（如 WB-035）。
 */
@Entity('training_log')
@Index('idx_training_log_training', ['training_id'])
export class TrainingLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '所属历练实例ID' })
  training_id: number;

  @Column({ type: 'text', comment: '叙事文本（agent 生成）' })
  content: string;

  @Column({ type: 'text', nullable: true, comment: '关键词 JSON：[{text,type}]' })
  keywords: string | null;

  @Column({ type: 'varchar', length: 64, comment: '遭遇的魔兽ID（如 WB-035）' })
  mob_id: string;

  @Column({ type: 'tinyint', comment: '1=胜利 0=逃跑' })
  won: number;

  @CreateDateColumn()
  created_at: Date;
}
