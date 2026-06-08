import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * NPC 职能表
 */
@Entity('npc_role')
export class NpcRole {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  prompt_hint: string;

  /** 在哪些 loc_type 的地点中必须出现此职能的 NPC */
  @Column({ type: 'text', nullable: true })
  required_in_loc_type: string[] | null;
}
