import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 剧本实例表（触发日志 + 演出进度 + 防重复）。
 *
 * 三重职责：
 *   1) 触发日志：谁/何时/哪个剧本被触发（player_id / outline_id / created_at / hook）
 *   2) 演出进度：当前演到哪个节点、走过的链路、状态（current_node / node_path / status）
 *   3) 防重复：同玩家+同剧本(outline_id)有 status='pending' 记录时不再触发
 *
 * 生命周期：触发命中 → INSERT(pending, current_node=start) → 演出推进(更新 current_node/node_path)
 *           → 走到结局节点 → UPDATE status=done
 * 本轮只做"触发命中建记录"，演出推进（更新 current_node/node_path/done）下一轮做。
 */
@Entity('script_instance')
export class ScriptInstance {
  @PrimaryGeneratedColumn()
  id: number;

  // ── 关联 ──
  @Column({ type: 'int' })
  outline_id: number;

  @Column({ type: 'varchar', length: 64 })
  story_id: string;

  @Column({ type: 'int' })
  player_id: number;

  @Column({ type: 'varchar', length: 32 })
  hook: string;

  // ── 演出进度 ──
  @Column({ type: 'varchar', length: 32, nullable: true })
  current_node: string | null;

  @Column({ type: 'json', nullable: true })
  node_path: string[] | null;

  /** 选角映射：{actor_key:{type,id}}
   *  配角=dynamic_npc, 玩家=player, 地点=location_scene/location_net。
   *  本轮地点全填玩家当前位置（不选地图）。 */
  @Column({ type: 'json', nullable: true })
  actor_mapping: Record<string, { type: string; id: number }> | null;

  /** 锁定前玩家原状态（演出结束恢复用）。 */
  @Column({ type: 'int', nullable: true })
  from_status: number | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: string; // pending(进行中) / done(已结束)

  // ── 触发追溯 ──
  @Column({ type: 'json', nullable: true })
  trigger_payload: any;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
