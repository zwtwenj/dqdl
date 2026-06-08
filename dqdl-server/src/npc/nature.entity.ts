import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * NPC 性格表（通用资源）
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
