import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 奇遇表：历练中发现的副本入口(dungeon)或洞天福地(cultivate)。
 *
 * 触发：训练 tick 中以 TRIGGER_RATE(10%) 概率生成一条 pending 记录，入玩家奇遇列表。
 * 本次范围仅"发现入口"，玩家可查看详情/放弃；点"进入"后的副本/洞天玩法留后续。
 *
 * status 流转：pending(未进入) → entered(已进入,后续玩法) / abandoned(放弃) / done(完成)。
 */
@Entity('encounter')
export class Encounter {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int', comment: '玩家ID' })
  player_id: number;

  @Column({
    type: 'varchar',
    length: 32,
    default: 'dungeon',
    comment: '奇遇类型: dungeon(秘境入口)/cultivate(洞天福地)',
  })
  kind: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: '',
    comment: '场景类型(山洞/密林/山谷/浅滩)，cultivate为空',
  })
  scene_type: string;

  @Column({
    type: 'int',
    nullable: true,
    comment: '星级(仅cultivate奇遇,1-3，决定修炼倍率)',
  })
  star: number | null;

  /** 关联的修炼会话ID（洞天福地，一对一，unique 约束） */
  @Column({ type: 'int', nullable: true, comment: '关联的修炼会话ID（洞天福地）' })
  cultivation_session_id: number | null;

  @Column({ type: 'varchar', length: 64, comment: '奇遇标题' })
  title: string;

  @Column({ type: 'varchar', length: 256, comment: '触发描述' })
  description: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: 'pending',
    comment: '状态: pending/entered/done/abandoned',
  })
  status: string;

  @CreateDateColumn()
  created_at: Date;
}
