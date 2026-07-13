import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * 秘境实例表：玩家进入的 AI 生成五幕副本。
 *
 * 编排：enter 时调 agent /generate/dungeon 生成五幕蓝图骨架 → enrichActs 按难度挂魔兽/魔核奖励 → 落库。
 * 进度：current_act 游标 + acts JSON 里每幕的 picked/looted 等运行时状态，全落库（支持刷新恢复）。
 * 状态机：active(进行中) → completed(通关) / escaped(撤退) / failed(战斗失败)。
 *
 * 本次第一期：只做编排闭环。战斗/临时背包结算留后续（temp_items 列已建好，逻辑待补）。
 */
@Entity('dungeon_instance')
export class DungeonInstance {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'int', comment: '玩家ID' })
  player_id: number;

  @Column({ type: 'varchar', length: 32, default: '', comment: '场景类型(山洞/密林/山谷/浅滩)' })
  scene_type: string;

  @Column({ type: 'int', default: 1, comment: '难度星级 1-3（决定魔兽/魔核等阶）' })
  difficulty: number;

  @Column({ type: 'varchar', length: 64, comment: '副本名称' })
  title: string;

  @Column({ type: 'text', nullable: true, comment: '入口引导叙事' })
  intro: string | null;

  /** 五幕蓝图 JSON 数组：[{index,type,title,narrative, mob?, reward?, picked?, looted?}] */
  @Column({ type: 'json', comment: '五幕蓝图JSON数组，含enrich后的mob/reward/运行时状态' })
  acts: any;

  @Column({ type: 'int', default: 1, comment: '当前幕游标 1-5' })
  current_act: number;

  @Column({ type: 'int', nullable: true, comment: '来源奇遇ID（结束时回写奇遇状态）' })
  encounter_id: number | null;

  @Column({ type: 'text', nullable: true, comment: '临时背包JSON[{name,count}]，本次不用，留后续' })
  temp_items: string;

  @Column({ type: 'varchar', length: 16, default: 'active', comment: '状态: active/completed/escaped/failed' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
