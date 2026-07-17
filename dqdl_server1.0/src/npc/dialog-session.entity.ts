import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * NPC 对话会话表（server 端，业务视角）。
 *
 * 每次打开对话弹窗 = 一行。messages 为 JSON 数组存对话内容：
 *   [{ role: 'player' | 'npc', time: 'ISO', message: string }]
 * 每次 talk 用 JSON_ARRAY_APPEND 原子追加（player 输入 + npc 回复两条）。
 *
 * agent 侧的精细调用记录在 agent_dialog_call 表（跨服务，server_session_id 绑定本表 id）。
 */
@Entity('dialog_session')
export class DialogSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  player_id: number;

  @Column({ type: 'int' })
  npc_id: number;

  /** npc_id 指向哪张表：static=static_npc / dynamic=dynamic_npc。
   *  两表独立自增会撞号，必须用本列区分。存量数据默认 static。 */
  @Column({ type: 'varchar', length: 8, default: 'static' })
  npc_type: string;

  @Column({ type: 'int', nullable: true })
  location_id: number | null;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  /** 对话内容 JSON 数组。TypeORM 对 JSON 列用手动 stringify（沿用项目惯例）。 */
  @Column({ type: 'json' })
  messages: any;

  @Column({ type: 'tinyint', default: 1, comment: '1=进行中 2=已关闭' })
  status: number;

  @Column({ type: 'int', default: 0 })
  rounds: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
