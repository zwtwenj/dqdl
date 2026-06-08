import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('player')
export class Player {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({ type: 'int', default: 1 })
  level: number;

  @Column({ type: 'int', default: 5, comment: '力量' })
  power: number;

  @Column({ type: 'int', default: 5, comment: '智力' })
  intelligence: number;

  @Column({ type: 'int', default: 5, comment: '敏捷' })
  quick: number;

  @Column({ type: 'int', default: 5, comment: '体质' })
  stamina: number;

  @Column({ type: 'int', default: 5, comment: '运气' })
  lucky: number;

  /** HP = stamina * 10（创建时计算一次，后续可能由其他维度修正） */
  @Column({ type: 'int', default: 50, comment: '生命值' })
  hp: number;

  /** 斗气 = level * 20 */
  @Column({ type: 'int', default: 20, comment: '斗气值' })
  energy: number;

  /** Buff 列表（buff id 数组） */
  @Column({ type: 'text', nullable: true, comment: 'Buff列表(JSON数组)' })
  buff: string | null;

  @Column({ type: 'int', default: 0, comment: '金币' })
  money: number;

  /** 战斗经验 — 影响伤害浮动和同级别免伤/卸力 */
  @Column({ type: 'int', default: 0, comment: '战斗经验' })
  exp: number;

  /** 修为 — 累积到阈值可突破升级（受功法+环境影响） */
  @Column({ type: 'int', default: 0, comment: '修为' })
  cultivation: number;

  /** 当前修炼功法ID */
  @Column({ type: 'int', default: 1, comment: '当前修炼功法ID' })
  technique_id: number;

  @CreateDateColumn({ comment: '创建时间' })
  created_at: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updated_at: Date;
}
