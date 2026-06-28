import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('player')
export class Player {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  /** 立绘图片地址（如 /image/hero-char.webp），由后端提供，前端直接用 URL */
  @Column({ type: 'varchar', length: 128, default: '/image/hero-char.webp', comment: '立绘图片地址' })
  portrait: string;

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

  /** 基础属性（创建时固定，不含等级成长）—— 等级成长由 levelAttrBonus(level) 派生 */
  @Column({ type: 'int', default: 0, comment: '基础力量(创建固定，不含等级成长)' })
  base_power: number;

  @Column({ type: 'int', default: 0, comment: '基础智力(创建固定，不含等级成长)' })
  base_intelligence: number;

  @Column({ type: 'int', default: 0, comment: '基础敏捷(创建固定，不含等级成长)' })
  base_quick: number;

  @Column({ type: 'int', default: 0, comment: '基础体质(创建固定，不含等级成长)' })
  base_stamina: number;

  @Column({ type: 'int', default: 0, comment: '基础运气(创建固定，不含等级成长)' })
  base_lucky: number;

  @Column({ type: 'int', default: 50, comment: '当前生命值' })
  hp: number;

  @Column({ type: 'int', default: 50, comment: '生命上限' })
  max_hp: number;

  @Column({ type: 'int', default: 20, comment: '当前斗气值' })
  energy: number;

  @Column({ type: 'int', default: 20, comment: '斗气上限' })
  max_energy: number;

  @Column({ type: 'text', nullable: true, comment: 'Buff列表(JSON数组)' })
  buff: string | null;

  /** 扩展属性 JSON，按分组存储：{ combat: {...}, life: {...}, points: {...} } */
  @Column({ type: 'text', default: '{}', comment: '扩展属性(JSON分组)' })
  extra_attrs: string;

  /** 已习得的斗技列表 [{ id, level, carry }, ...] */
  @Column({ type: 'text', default: '[]', comment: '玩家斗技列表(JSON数组)' })
  skill: string;

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

  /** 已习得功法及修炼进度(JSON数组)，与 skill 类似：[{id, level, cultivation, max_cultivation}] */
  @Column({ type: 'text', default: '[]', comment: '已习得功法及进度(JSON数组)' })
  technique: string;

  /** 已装备宝物(JSON数组，与 skill 槽位同构)：[{id(宝物定义id), slot(1-5)}]，最多5件 */
  @Column({ type: 'text', default: '[]', comment: '已装备宝物(JSON):[{id,slot}]' })
  treasures: string;

  @CreateDateColumn({ comment: '创建时间' })
  created_at: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updated_at: Date;

  @Column({ type: 'varchar', length: 512, default: '', comment: '玩家当前位置路径(JSON ID数组)' })
  position: string;

  @Column({ type: 'tinyint', default: 1, comment: '用户状态: 1=正常' })
  status: number;
}