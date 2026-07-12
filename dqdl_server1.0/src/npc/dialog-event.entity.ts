import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * NPC 对话快捷事件表（对话弹窗内快捷按钮的来源）。
 * 挂 npc_role（同 role 的 NPC 共享同样的快捷事件）。
 * event 存事件类型字符串（trade/...），后端按字符串分发。
 */
@Entity('dialog_event')
export class DialogEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  role_id: number;

  @Column({ type: 'varchar', length: 128 })
  text: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  event: string;

  @Column({ type: 'int', default: 0 })
  sort: number;
}
