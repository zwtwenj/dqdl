import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * 普通怪物表 — 从魔兽图鉴中提取，关联图鉴ID
 */
@Entity('mob')
export class Mob {
  @PrimaryGeneratedColumn()
  id: number;

  /** 图鉴中的怪物ID，如 WB-001 */
  @Column({ type: 'varchar', length: 16, comment: '图鉴ID' })
  mob_id: string;

  @Column({ type: 'varchar', length: 64, nullable: true, comment: '怪物名称' })
  name: string | null;

  @Column({ type: 'text', nullable: true, comment: '描述（外观/体型/能力/弱点）' })
  description: string | null;

  /** 属性：火/冰/风/土/雷/暗/毒/木/水 */
  @Column({ type: 'varchar', length: 8, nullable: true, comment: '元素属性' })
  attribute: string | null;

  /** 战力编码：3=斗之气三段, 13=三星斗者 */
  @Column({ type: 'int', default: 0, comment: '战力编码' })
  power: number;

  @Column({ type: 'int', default: 0, comment: '智力' })
  intelligence: number;

  @Column({ type: 'int', default: 0, comment: '敏捷' })
  quick: number;

  @Column({ type: 'int', default: 0, comment: '体力' })
  stamina: number;

  /** 等级，对应 player 的 level */
  @Column({ type: 'int', default: 0, comment: '等级' })
  level: number;

  /** 掉落物 JSON：[{item_id,name,rate,min,max,type}] */
  @Column({ type: 'text', nullable: true, comment: '掉落物列表(JSON)' })
  drops: string | null;
}
