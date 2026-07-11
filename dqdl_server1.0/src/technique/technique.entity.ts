import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 功法表（图鉴专用）。
 * 字段设计沿用老版本（master 分支 dqdl-server），仅追加 item_id 与 item 体系对齐。
 *
 * 与 item 表的关系：item 表中 type='功法' 的行可通过 ref_type='technique' + ref_id 指向本表。
 * item_id 为功法全局唯一编码（gf- 前缀），与 item 表的 item_id 对齐。
 *
 * 字段说明：
 * - rank：品阶编码，十位=阶（天1/地2/玄3/黄4），个位=品（上1/中2/下3）。如 43=黄阶下品。
 * - base：属性加成 JSON。支持两种结构：
 *     1) 扁平对象 {power:5, stamina:5} —— 单一加成（不分等级）；
 *     2) 数组 [{level:1, params:{...}, max_cultivation:100}, ...] —— 按等级给出不同加成与升级所需修为。
 * - growth：修为增长速度（修炼效率系数）。
 * - max_level：功法可修炼的最高等级。
 *
 * player.technique(JSON 数组) 存玩家已习得功法的持有态（含等级/进度等），
 * 通过 item_id 或 id 关联回本表查静态定义。
 *
 * 不使用外键，关联按 item_id 约定。
 */
@Entity('technique')
export class Technique {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, comment: '功法ID（gf-h1-1），与 item 表 item_id 对齐' })
  item_id: string;

  @Column({ type: 'varchar', length: 64, comment: '功法名' })
  name: string;

  @Column({ type: 'varchar', length: 8, comment: '属性：金/木/水/火/土/风/雷' })
  attribute: string;

  /** 品阶编码：43=黄阶下品 42=黄阶中品 41=黄阶上品 ... 11=天阶上品 */
  @Column({ type: 'int', comment: '品阶: 43=黄阶下品 42=黄阶中品 ... 11=天阶上品' })
  rank: number;

  /** 修为增长速度（修炼效率系数） */
  @Column({ type: 'int', default: 10, comment: '修为增长速度' })
  growth: number;

  /** 基础属性加成 JSON: 扁平 {power:5} 或 按等级 [{level,params,max_cultivation}] */
  @Column({ type: 'text', nullable: true, comment: '基础属性加成(JSON)' })
  base: string | null;

  /** 功法最大等级 */
  @Column({ type: 'int', default: 3, comment: '功法最大等级' })
  max_level: number;

  @Column({ type: 'text', nullable: true, comment: '描述' })
  description: string | null;

  @CreateDateColumn()
  created_at: Date;
}
