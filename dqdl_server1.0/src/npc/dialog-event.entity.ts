import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * NPC 对话快捷事件表（对话弹窗内快捷按钮的来源）。
 * 挂 npc_role（同 role 的 NPC 共享同样的快捷事件）。
 * event 存事件类型字符串（trade/...），后端按字符串分发。
 *
 * visible_rule：可见性规则函数名（空串=始终显示，非空=规则库中的函数名）。
 *   NpcService.findOne 返回 dialog_events 时，按规则名查 dialog-visible-rules
 *   调用对应函数（接收 player 上下文），返回 false 则该事件不返回给前端。
 *   例：'hasClaimableTask' = 玩家有可交付的佣兵任务时才显示「交付任务」按钮。
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

  @Column({ type: 'varchar', length: 64, default: '', comment: '可见性规则函数名（空=始终显示）' })
  visible_rule: string;

  @Column({ type: 'int', default: 0 })
  sort: number;
}
