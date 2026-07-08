import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 魔兽表：图鉴数据（全局共享）。
 * mob_id 为图鉴唯一编码，WB- 前缀为固定图鉴，AGENT- 前缀为 AI 生成。
 * drops 存掉落物 JSON，引用 item 表 item_id。
 *
 * 不使用外键，drops 中的 item_id 仅按约定关联。
 */
@Entity('mob')
export class Mob {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, comment: '图鉴ID（WB-001 / AGENT- 前缀）' })
  mob_id: string;

  @Column({ type: 'varchar', length: 64, comment: '怪物名称' })
  name: string;

  @Column({ type: 'text', nullable: true, comment: '描述（外观/能力/弱点）' })
  description: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true, comment: '元素属性：火/冰/风/土/雷/暗/毒/木/水' })
  attribute: string | null;

  @Column({ type: 'int', default: 0, comment: '战力编码（3=斗之气三段，13=三星斗者）' })
  power: number;

  @Column({ type: 'int', default: 0, comment: '智力' })
  intelligence: number;

  @Column({ type: 'int', default: 0, comment: '敏捷' })
  quick: number;

  @Column({ type: 'int', default: 0, comment: '体力' })
  stamina: number;

  @Column({ type: 'int', default: 1, comment: '等级' })
  level: number;

  @Column({ type: 'text', nullable: true, comment: '掉落物 JSON：[{item_id,name,rate,min,max,type}]' })
  drops: string | null;

  @CreateDateColumn()
  created_at: Date;
}
