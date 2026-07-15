import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * NPC 职能参考表。
 * prompt_hint 喂给 LLM 的身份描述。
 * required_in_loc_type：必出现此职能的场景类型数组（如 ['guild']）。
 *   城市新场景创建时，LocationNetService 据此决定该场景必须生成哪种职能的 NPC。
 *   空表示不强制（非必生）。配置在 DB，可随时调整，无需改代码。
 */
@Entity('npc_role')
export class NpcRole {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  prompt_hint: string;

  @Column({ type: 'json', nullable: true, comment: '必出现此职能的场景类型数组' })
  required_in_loc_type: string[] | null;
}
