import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * 移动实例表：玩家在网状地图上移动的一次记录（可能多段）。
 *
 * 速度 = base_quick + levelAttrBonus(level)（实时计算，纯基础敏捷）。
 * 单段时长(秒) = ceil(距离 × 60 / 速度)。多段移动按 line 队列逐段走，每段独立计时。
 * line 存完整路径（节点对象数组），大地图据此画路径；current_net_id 追踪当前走到哪。
 * 生命周期：active(进行中) → finished(结束，走完或取消均算结束)。
 */
@Entity('move_session')
export class MoveSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  player_id: number;

  @Column({ type: 'int' })
  from_net_id: number;

  @Column({ type: 'int' })
  to_net_id: number;

  /** 玩家当前已到达的节点 id（多段移动实时追踪进度）。
   *  startMove 时 = line[0]（起点）；arrive 走下一段时推进；cancel 时玩家停在此节点。 */
  @Column({ type: 'int', comment: '当前已到达节点 id（多段移动进度）' })
  current_net_id: number;

  /** 当前正在走的段索引（0=第一段）。arrive 走完一段后 +1。 */
  @Column({ type: 'int', default: 0, comment: '当前段索引（0起）' })
  current_seg: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  from_name: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  to_name: string | null;

  /** 移动路径：节点对象数组 JSON [{id,name,gx,gy}, ...]。
   *  单步移动 = [起点, 终点]；后续寻路支持多段时 = 完整途经节点序列。
   *  大地图据此画变色路径线（含坐标，无需再查节点）。 */
  @Column({ type: 'text', nullable: true, comment: '移动路径 JSON:[{id,name,gx,gy}]' })
  line: string | null;

  @Column({ type: 'int', default: 70 })
  distance: number;

  @Column({ type: 'int' })
  speed: number;

  @Column({ type: 'int' })
  duration_sec: number;

  @Column({ type: 'datetime', precision: 6 })
  start_at: Date;

  @Column({ type: 'datetime', precision: 6 })
  end_at: Date;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: string; // active=进行中; finished=结束（走完或取消，不区分）

  @CreateDateColumn()
  created_at: Date;
}
