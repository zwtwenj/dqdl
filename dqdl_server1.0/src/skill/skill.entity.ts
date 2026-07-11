import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 斗技表（图鉴专用）。
 * 字段设计沿用老版本（master 分支 dqdl-server/src/skill），仅追加 item_id 与 item 体系对齐。
 *
 * 与 item 表的关系：item 表中 type='武技' 的行可通过 ref_type='skill' + ref_id 指向本表。
 * item_id 为斗技全局唯一编码（dj- 前缀），与 item 表的 item_id 对齐；图标走 sk-xxx。
 *
 * 与功法（technique）表同构，字段说明：
 * - rank：品阶编码，同功法（43=黄阶下品 … 11=天阶上品）。
 * - attr：关联属性 power/intelligence/quick/stamina（决定伤害系数取哪个属性）。
 * - base_damage：固定基础伤害。
 * - levels：按等级的命名参数表 JSON [{level, params:{damageRate, ...}}, ...]。
 * - target_effects / self_effects / carried：命中附加 / 自身增益 / 携带效果 buff key 数组 JSON。
 *   （重构版目前未接战斗引擎，这些字段先建列占位，前端斗技弹窗只展示基本信息。）
 * - energy_cost：斗气消耗。
 *
 * player.skill(JSON 数组) 存玩家已习得斗技的持有态（含 level/cultivation/carry），
 * 通过 id 关联回本表查静态定义。
 *
 * 不使用外键，关联按 id 约定。
 */
@Entity('skill')
export class Skill {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, comment: '斗技ID（dj-001），与 item 表 item_id 对齐' })
  item_id: string;

  @Column({ type: 'varchar', length: 64, comment: '斗技名' })
  name: string;

  /** 关联属性：power / intelligence / quick / stamina */
  @Column({ type: 'varchar', length: 16, comment: '关联属性' })
  attr: string;

  /** 品阶编码，同功法：43=黄阶下品 … 11=天阶上品 */
  @Column({ type: 'int', comment: '品阶: 43=黄阶下品 42=黄阶中品 ... 11=天阶上品' })
  rank: number;

  /** 基础固定伤害 */
  @Column({ type: 'int', default: 0, comment: '基础伤害' })
  base_damage: number;

  /** 按等级的命名参数表 JSON: [{level:1, params:{damageRate,...}}, ...] */
  @Column({ type: 'text', nullable: true, comment: '按等级命名参数表(JSON)' })
  levels: string | null;

  /** 目标附加效果 buff key JSON数组（命中投递给目标，战斗引擎解析） */
  @Column({ type: 'text', nullable: true, comment: '命中附加效果buff key(JSON数组)' })
  target_effects: string | null;

  /** 自身附加效果 buff key JSON数组（自身挂的 buff） */
  @Column({ type: 'text', nullable: true, comment: '自身增益buff key(JSON数组)' })
  self_effects: string | null;

  /** 携带型效果 buff key JSON数组（骑在本次攻击上） */
  @Column({ type: 'text', nullable: true, comment: '携带型效果buff key(JSON数组)' })
  carried: string | null;

  /** 斗气消耗 */
  @Column({ type: 'int', default: 10, comment: '斗气消耗' })
  energy_cost: number;

  /** 斗技最大等级 */
  @Column({ type: 'int', default: 3, comment: '斗技最大等级' })
  max_level: number;

  @Column({ type: 'text', nullable: true, comment: '描述(供 agent 生成战斗图文)' })
  description: string | null;

  @CreateDateColumn()
  created_at: Date;
}
