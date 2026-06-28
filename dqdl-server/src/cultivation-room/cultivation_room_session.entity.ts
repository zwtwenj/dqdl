import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/** 城内修炼室会话：玩家选定档位后按 tick 结算修为并扣金币 */
@Entity('cultivation_room_session')
export class CultivationRoomSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', comment: '玩家ID' })
  player_id: number;

  /** 修炼内容：qi=修炼斗气(玩家突破修为)，technique=修炼功法，skill=修炼斗技 */
  @Column({ type: 'varchar', length: 16, default: 'qi', comment: '修炼类型: qi/technique/skill' })
  mode: string;

  /** 目标ID：technique 模式=功法ID，skill 模式=斗技ID；qi 模式为 null（复用同一列） */
  @Column({ type: 'int', nullable: true, comment: '目标ID(technique=功法ID / skill=斗技ID)' })
  target_technique_id: number | null;

  /** 档位 1-3，决定修炼倍率与每跳金币 */
  @Column({ type: 'int', comment: '档位(1-3)' })
  tier: number;

  @Column({ type: 'int', default: 0, comment: '已结算轮次' })
  rounds: number;

  @Column({ type: 'int', default: 0, comment: '累计获得修为' })
  total_gained: number;

  @Column({ type: 'int', default: 0, comment: '累计消耗金币' })
  total_cost: number;

  @Column({ type: 'varchar', length: 16, default: 'active', comment: '状态: active/stopped/finished' })
  status: string;

  @CreateDateColumn({ comment: '创建时间' })
  created_at: Date;

  @UpdateDateColumn({ comment: '更新时间' })
  updated_at: Date;
}
