import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * NPC 性格参考表（通用资源）。
 * prompt_hint 喂给 LLM 的人格描述。
 */
@Entity('nature')
export class Nature {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  prompt_hint: string;
}
