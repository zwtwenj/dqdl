import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { NpcRole } from './npc-role.entity';

/**
 * 对话事件表 —— 每个职业可提供的快捷对话选项
 */
@Entity('dialog_event')
export class DialogEvent {
  @PrimaryGeneratedColumn()
  id: number;

  /** 所属职业 ID */
  @Column({ type: 'int' })
  role_id: number;

  /** 显示文本（如"我想要接受一些任务"） */
  @Column({ type: 'varchar', length: 128 })
  text: string;

  /** 事件标识，暂时留空 */
  @Column({ type: 'varchar', length: 64, default: '' })
  event: string;

  @ManyToOne(() => NpcRole)
  @JoinColumn({ name: 'role_id' })
  role: NpcRole;
}
