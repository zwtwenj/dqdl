import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * NPC 商店配货表（npc_role 维度）。
 * 同 role_id 的 NPC 共享商品列表。
 * 通过 item_id 关联 item 表取价格/名称等。
 */
@Entity('npc_shop')
export class NpcShop {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  role_id: number;

  @Column({ type: 'varchar', length: 32 })
  item_id: string;

  @Column({ type: 'int', default: 0 })
  sort: number;
}
