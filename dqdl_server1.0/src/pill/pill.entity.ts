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
 * 效果模型（即时型，本次不实现 buff 持久化）：
 *   effect_type='heal_hp'     → 回生命，target 固定 'hp'，player.hp = min(max_hp, hp+amount)
 *   effect_type='heal_energy' → 回斗气，target 固定 'energy'，player.energy = min(max_energy, energy+amount)
 *   effect_type='attr'        → 加五维属性之一，target ∈ power/intelligence/quick/stamina/lucky
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

  @Column({
    type: 'varchar',
    length: 16,
    comment: '效果类型：heal_hp/heal_energy/attr',
  })
  effect_type: string;

  @Column({
    type: 'varchar',
    length: 16,
    comment: '作用属性：hp/energy/power/intelligence/quick/stamina/lucky',
  })
  target: string;

  @Column({ type: 'int', default: 0, comment: '数值（加血量/加斗气量/属性增量）' })
  amount: number;

  @Column({ type: 'text', nullable: true, comment: '药效描述' })
  description: string | null;

  @CreateDateColumn()
  created_at: Date;
}
