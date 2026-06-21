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

  @Column({ type: 'int', default: 50, comment: '生命值' })
  hp: number;

  @Column({ type: 'int', default: 20, comment: '斗气值' })
  energy: number;

  @Column({ type: 'text', nullable: true, comment: 'Buff列表(JSON数组)' })
  buff: string | null;

  /** 扩展属性 JSON，按分组存储：{ combat: {...}, life: {...}, points: {...} } */
  @Column({ type: 'text', default: '{}', comment: '扩展属性(JSON分组)' })
  extra_attrs: string;

  @Column({ type: 'int', default: 0, comment: '金币' })
  money: number;

  @Column({ type: 'int', default: 0, comment: '战斗经验' })
  exp: number;

  @Column({ type: 'int', default: 0, comment: '修为' })
  cultivation: number;

  /** 当前等级最大修为（达到后修炼不再增长） */
  @Column({ type: 'int', default: 100, comment: '当前等级修为上限' })
  level_cultivation: number;

  @Column({ type: 'int', default: 1, comment: '当前修炼功法ID' })
  technique_id: number;

  @CreateDateColumn({ comment: '创建时间' })
  created_at: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updated_at: Date;

  @Column({ type: 'varchar', length: 512, default: '', comment: '玩家当前位置路径(JSON ID数组)' })
  position: string;

  @Column({ type: 'tinyint', default: 1, comment: '用户状态: 1=正常' })
  status: number;
}