import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('dungeon_instance')
export class DungeonInstance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '玩家ID' })
  player_id: number;

  @Column({ type: 'varchar', length: 32, comment: '场景类型(山洞/密林/山谷/浅滩)' })
  scene_type: string;

  /** 难度星级 1-3：作为副本内事件锚点（1星=一阶魔兽/一阶魔核，依此类推） */
  @Column({ type: 'int', default: 1, comment: '难度星级(1-3)' })
  difficulty: number;

  @Column({ type: 'varchar', length: 64, comment: '副本名称' })
  title: string;

  @Column({ type: 'text', comment: '入口引导叙事' })
  intro: string;

  /** 五幕蓝图 JSON 数组: [{ index, type, title, narrative }] */
  @Column({ type: 'json', comment: '五幕蓝图(JSON数组)' })
  acts: any[];

  @Column({ type: 'int', default: 1, comment: '当前幕(1-5)' })
  current_act: number;

  /** 来源奇遇ID（由奇遇进入时记录，会话结束时回写奇遇状态） */
  @Column({ type: 'int', nullable: true, comment: '来源奇遇ID' })
  encounter_id: number | null;

  /** 副本临时背包 JSON: [{name, count}]，通关后转入玩家主背包，撤退则丢失 */
  @Column({ type: 'text', default: '[]', comment: '副本临时背包(JSON)' })
  temp_items: string;

  @Column({ type: 'varchar', length: 16, default: 'active', comment: '状态: active/completed/escaped/failed' })
  status: string;

  @CreateDateColumn({ comment: '创建时间' })
  created_at: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updated_at: Date;
}
