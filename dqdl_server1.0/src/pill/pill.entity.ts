import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 丹药表（成品丹药效果定义）。
 * 与 item 表按 item_id 对齐：item.type='丹药' && item.usable=1 && item.ref_type='pill'。
 *
 * 效果配置走 effect 字段（JSON），格式为 key→参数 映射，支持单/多效果叠加：
 *   { "heal_hp": 30 }                                  回生命
 *   { "heal_energy": 20 }                              回斗气
 *   { "gain_cultivation": 50 }                         加修为
 *   { "add_breakthrough_bonus": 15 }                   加突破成功率
 *   { "addAttr": { "power": 5 } }                      加五维属性（永久，写 base_*）
 *   { "addBuff": { "key": "qingxin_t1", "scope": "next_battle" } }  加战斗buff
 *   { "heal_hp": 30, "heal_energy": 20 }               多效果叠加
 * key 与 pill-effect.library.ts 的 effectHandlers 一一对应，未知 key 报错。
 *
 * effect_type/target/amount 三列为旧结构，已废弃不再读取，保留仅为向后兼容历史数据。
 */
@Entity('pill')
export class Pill {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, comment: '丹药ID（与 item.item_id 对齐）' })
  item_id: string;

  @Column({ type: 'varchar', length: 64, comment: '丹药名' })
  name: string;

  /** 效果 JSON（key→参数），新逻辑只读此字段 */
  @Column({ type: 'text', nullable: true, comment: '效果JSON：{key:params}，如 {"heal_hp":30}' })
  effect: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    comment: '[已废弃] 旧效果类型，保留兼容',
  })
  effect_type: string;

  @Column({
    type: 'varchar',
    length: 16,
    comment: '[已废弃] 旧作用属性，保留兼容',
  })
  target: string;

  @Column({ type: 'int', default: 0, comment: '[已废弃] 旧数值，保留兼容' })
  amount: number;

  @Column({ type: 'text', nullable: true, comment: '药效描述' })
  description: string | null;

  @CreateDateColumn()
  created_at: Date;
}
