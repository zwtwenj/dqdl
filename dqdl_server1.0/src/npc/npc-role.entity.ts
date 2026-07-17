import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * NPC 职能/职业参考表（静态职能 + 动态职业同居一表）。
 * prompt_hint 喂给 LLM 的身份描述。
 * required_in_loc_type：必出现此职能的场景类型数组（如 ['guild']）。
 *   城市新场景创建时，LocationNetService 据此决定该场景必须生成哪种职能的 NPC。
 *   空表示不强制（非必生）。配置在 DB，可随时调整，无需改代码。
 *
 * category 区分两类（add_npc_role_category.sql 扩展）：
 *   'role'        = 静态职能（公会接待员/坊市管理员…），绑 static_npc
 *   'profession'  = 动态职业（散修/佣兵/赏金猎人…），绑 dynamic_npc 演员池
 * Agent 运行时也可往里插新职业（is_system=0），无需改代码。
 */
@Entity('npc_role')
export class NpcRole {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({
    type: 'varchar',
    length: 16,
    default: 'role',
    comment: 'role=静态职能; profession=动态职业',
  })
  category: string;

  @Column({
    type: 'tinyint',
    default: 1,
    comment: '1=系统内置(seed); 0=Agent运行时创建',
  })
  is_system: number;

  @Column({ type: 'varchar', length: 255 })
  prompt_hint: string;

  @Column({ type: 'json', nullable: true, comment: '必出现此职能的场景类型数组' })
  required_in_loc_type: string[] | null;
}
