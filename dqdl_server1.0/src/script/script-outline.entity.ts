import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

/**
 * 剧本大纲表（只读 entity）：由 dqdl-agent 的 generate_outline/storyboard 写库。
 * 后端仅读取用于剧本触发（hook + trigger_conditions + trigger_rate）和演出。
 *
 * 字段对齐 migrations/add_script_outline.sql + add_script_outline_storyboard.sql +
 * add_script_trigger.sql。actor_map/location_map/nodes 为 JSON。
 */
@Entity('script_outline')
export class ScriptOutline {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  story_id: string;

  @Column({ type: 'varchar', length: 64 })
  title: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  hook: string | null;

  @Column({ type: 'json', nullable: true })
  trigger_conditions: any;

  @Column({ type: 'int', nullable: true, default: 100 })
  trigger_rate: number | null;

  @Column({ type: 'json', nullable: true })
  location_map: any;

  @Column({ type: 'json', nullable: true })
  actor_map: any;

  @Column({ type: 'json', nullable: true })
  nodes: any;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: string;
}
