import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * Buff 效果子表：一个 buff 可有多条效果，每条绑定一个钩子 + fn_id。
 * fn_id 指向代码仓里的 buff-library（受信任、可类型检查），params 是纯数据。
 * 这就是"函数库放代码、DB 只存 fn_id"的实现。
 */
@Entity('buff_effect')
export class BuffEffect {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'buff_id', type: 'int' })
  buffId: number;

  /** onTurnStart/onTurnEnd/beforeAttack/beforeHit/afterHit/afterAttack/passive */
  @Column({ type: 'varchar', length: 24 })
  hook: string;

  @Column({ name: 'fn_id', type: 'varchar', length: 32, comment: 'buff-library 函数id' })
  fnId: string;

  @Column({ type: 'text', nullable: true, comment: '参数JSON' })
  params: string | null;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ type: 'boolean', default: false, comment: '触发后消耗一层(一次性)' })
  consume: boolean;
}
