import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * 玩家表（重构版）：每个 character_id 对应一个 player。
 * location_id 指向全局地图（所有角色共享同一份地图树）。
 *
 * 属性系统：status 由后端统一处理。
 * - base_* 为创建时固定的基础属性（永不变）。
 * - 当前属性（power/quick/...）不存储，读取时实时计算 = base_* + levelAttrBonus(level)。
 *   改 base_* 或 level 立即生效，无需重算持久化（消除 base 与当前值漂移）。
 * - max_hp = stamina * 10，max_energy = level * 20（突破时重算持久化）。
 * - final_attrs 由 findOne 实时聚合（当前 + 功法/宝物加成，后者后续接入）。
 */
@Entity('player')
export class Player {
  @PrimaryGeneratedColumn()
  id: number;

  /** 所属角色 ID（一个角色一个 player） */
  @Column({ type: 'int', unique: true, comment: '所属角色ID' })
  character_id: number;

  @Column({ type: 'varchar', length: 32, comment: '角色名' })
  name: string;

  @Column({ type: 'int', default: 1, comment: '等级' })
  level: number;

  /** 当前所在地点 ID（全局地图） */
  @Column({ type: 'int', nullable: true, comment: '当前位置 location_id' })
  location_id: number | null;

  /** 当前所在场景 ID（location_scene.id，NULL=在地图上未进入任何场景） */
  @Column({ type: 'int', nullable: true, comment: '当前场景 location_scene.id（NULL=不在场景，在地图上）' })
  scene_id: number | null;

  // ===== 基础属性（创建时固定，不含等级成长） =====
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

  // ===== 生命 / 斗气 =====
  @Column({ type: 'int', default: 50, comment: '当前生命值' })
  hp: number;

  @Column({ type: 'int', default: 50, comment: '生命上限(stamina*10)' })
  max_hp: number;

  @Column({ type: 'int', default: 20, comment: '当前斗气值' })
  energy: number;

  @Column({ type: 'int', default: 20, comment: '斗气上限(level*20)' })
  max_energy: number;

  // ===== 修为系统 =====
  @Column({ type: 'int', default: 0, comment: '修为' })
  cultivation: number;

  @Column({ type: 'int', default: 100, comment: '当前等级修为上限(K*level^2)' })
  level_cultivation: number;

  @Column({ type: 'int', default: 0, comment: '战斗经验' })
  exp: number;

  // ===== 经济 =====
  @Column({ type: 'int', default: 0, comment: '金币' })
  money: number;

  // ===== 预留玩法字段（先建列，本次不实现逻辑） =====
  @Column({ type: 'text', nullable: true, comment: 'Buff列表(JSON数组)' })
  buff: string | null;

  @Column({ type: 'text', default: '[]', comment: '玩家斗技列表(JSON数组)' })
  skill: string;

  @Column({ type: 'text', default: '[]', comment: '已习得功法及进度(JSON数组)' })
  technique: string;

  @Column({ type: 'varchar', length: 2000, default: '[]', comment: '已习得丹方JSON [recipe_id,...]' })
  recipes: string;

  @Column({ type: 'varchar', length: 32, nullable: true, comment: '当前装备丹炉item_id' })
  equipped_furnace: string | null;

  @Column({ type: 'int', default: 0, comment: '当前丹炉耐久' })
  furnace_durability: number;

  @Column({ type: 'text', default: '[]', comment: '已装备宝物(JSON):[{id,slot}]' })
  treasures: string;

  @Column({ type: 'text', default: '{}', comment: '扩展属性(JSON分组)' })
  extra_attrs: string;

  @Column({ type: 'int', default: 0, comment: '下次突破成功率加成(百分比)' })
  breakthrough_bonus: number;

  // ===== 活动状态（后端唯一权威） =====
  @Column({ type: 'tinyint', default: 1, comment: '状态: 1=空闲 2=历练 3=副本 4=洞天 5=修炼室 6=采集 7=战斗 8=剧本演出 9=移动中' })
  status: number;

  /** 叠加状态：0=无 7=战斗中（status 保持来源状态，如秘境中战斗=3+7） */
  @Column({ type: 'int', default: 0, comment: '叠加状态：0=无 7=战斗中（status 保持来源）' })
  active_status: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
