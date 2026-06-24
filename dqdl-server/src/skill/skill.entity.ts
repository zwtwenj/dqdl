import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * 斗技表
 * rank 编码: 天阶=1x, 地阶=2x, 玄阶=3x, 黄阶=4x; 上品=1, 中品=2, 下品=3
 * 如 31 = 玄阶上品, 43 = 黄阶下品
 * 伤害公式: base_damage + scaling[level-1] * attr  上下浮动10%
 */
@Entity('skill')
export class Skill {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'text', nullable: true, comment: '描述(供agent生成战斗图文)' })
  description: string | null;

  /** 基础固定伤害 */
  @Column({ type: 'int', default: 0, comment: '基础伤害' })
  base_damage: number;

  /** 关联属性：power / intelligence / quick / stamina */
  @Column({ type: 'varchar', length: 16, comment: '关联属性' })
  attr: string;

  /** 倍率数组 JSON: [1.2, 1.4, 1.6, 1.8, 2.0] 对应各等级 */
  @Column({ type: 'text', comment: '倍率数组(JSON)' })
  scaling: string;

  /** 按等级的命名参数表 JSON: [{level:1, params:{伤害倍率,破甲倍率,...}}, ...] */
  @Column({ type: 'text', nullable: true, comment: '按等级命名参数表(JSON)' })
  levels: string | null;

  /** 品阶编码，同功法 */
  @Column({ type: 'int', comment: '品阶: 31=玄阶上品 42=黄阶中品 ... 11=天阶上品' })
  rank: number;

  @Column({ type: 'int', default: 1, comment: '当前等级' })
  level: number;

  @Column({ type: 'int', comment: '最大等级' })
  max_level: number;

  /** 目标附加效果 JSON数组: 命中投递给目标的buff key ["burn","bleed"] */
  @Column({ type: 'text', nullable: true, comment: '命中投递给目标的buff key(JSON数组)' })
  target_effects: string | null;

  /** 自身附加效果 JSON数组: 自身挂的buff key ["power_surge"] */
  @Column({ type: 'text', nullable: true, comment: '自身挂的buff key(JSON数组)' })
  self_effects: string | null;

  /** 携带型效果 JSON数组: 骑在本次攻击上的buff key ["pojia"] */
  @Column({ type: 'text', nullable: true, comment: '携带型效果buff key(JSON数组)' })
  carried: string | null;

  /** 斗气消耗 */
  @Column({ type: 'int', default: 10, comment: '斗气消耗' })
  energy_cost: number;
}
