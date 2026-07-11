import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * NPC 职能参考表。
 * prompt_hint 喂给 LLM 的身份描述。
 */
@Entity('npc_role')
export class NpcRole {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  prompt_hint: string;
}
