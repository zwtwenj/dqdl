import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 统一修炼会话表（合并洞天福地 + 修炼室）。
 *
 * 用 scene 字段区分两类场景，共用同一套收益公式（PlayerService.cultivate）：
 *   effectiveQi = BLESSSED_LAND.baseQi × starMult[tier]
 *
 * scene='blessed' 洞天福地：奇遇驱动、免费、按 max_rounds 结束、结束 markDone 奇遇。
 *   - encounter_id 来源奇遇；tier = 星级；cost_per_round 恒 0；max_rounds = 10。
 *
 * scene='room' 修炼室：城内付费、每轮扣金币、按 planned_seconds(玩家选的时长) 结束。
 *   - encounter_id 为 null；tier = 档位；cost_per_round = 200/400/800；
 *   - planned_seconds 由玩家选择(1~8分钟)，到时自动结束(reason=timeout)。
 *
 * last_settled_at：惰性离线补偿基准——最后一次结算时刻。
 *   SSE 断开（关页面/刷新）后端即停算；重连时 resume() 据此计算漏结算轮数并补发。
 *
 * status: active=进行中 / stopped=主动停止 / finished=自然结束(到期/修满/金币不足)。
 */
@Entity('cultivation_session')
export class CultivationSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  player_id: number;

  /** 场景：blessed=洞天福地 / room=修炼室 */
  @Column({ type: 'varchar', length: 16, default: 'room', comment: '场景: blessed/room' })
  scene: string;

  /** 来源奇遇ID（仅 blessed 有，结束时回写奇遇状态） */
  @Column({ type: 'int', nullable: true, comment: '来源奇遇ID（仅 blessed）' })
  encounter_id: number | null;

  /** 倍率档位(1/2/3)：blessed=星级，room=档位，共用 starMult 倍率表 */
  @Column({ type: 'int', comment: '倍率档位(1/2/3)，共用 starMult' })
  tier: number;

  @Column({ type: 'int', default: 0, comment: '已结算轮次' })
  rounds: number;

  @Column({ type: 'int', default: 0, comment: '累计获得修为' })
  total_gained: number;

  /** 累计消耗金币（仅 room，blessed 恒 0） */
  @Column({ type: 'int', default: 0, comment: '累计消耗金币（仅 room）' })
  total_cost: number;

  /** 每轮金币消耗（room: 200/400/800，blessed: 0），会话创建时从配置带入 */
  @Column({ type: 'int', default: 0, comment: '每轮金币消耗（blessed=0）' })
  cost_per_round: number;

  /** 最大轮次（blessed=10；room 用大数占位，实际按时长结束） */
  @Column({ type: 'int', default: 10, comment: '最大轮次（blessed 用）' })
  max_rounds: number;

  /** 计划修炼时长（秒，仅 room；blessed=0） */
  @Column({ type: 'int', default: 0, comment: '计划修炼时长(秒，仅 room)' })
  planned_seconds: number;

  /** 最后一次结算时刻——惰性离线补偿基准 */
  @Column({ type: 'datetime', precision: 6, nullable: true, comment: '最后结算时刻（离线补偿基准）' })
  last_settled_at: Date | null;

  /** 实际结束时刻 */
  @Column({ type: 'datetime', precision: 6, nullable: true, comment: '实际结束时刻' })
  ended_at: Date | null;

  /** 结束原因：full(修满)/timeout(到期)/rounds(轮满)/insufficient(金币不足)/stopped(主动)/error */
  @Column({ type: 'varchar', length: 16, nullable: true, comment: '结束原因' })
  end_reason: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active', comment: 'active/stopped/finished' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
