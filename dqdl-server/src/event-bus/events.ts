/**
 * 领域事件载荷契约。
 *
 * 玩家关键动作（突破/击杀/进地点等）通过 EventEmitter2 发出 PlayerEvent，
 * 由 AgentOrchestrator 监听并决定是否触发 agent 动态编排。
 *
 * 监听器一律 try/catch，事件总线失败绝不影响主流程。
 */
export interface PlayerEvent {
  /** 玩家ID */
  playerId: number;
  /** 事件类型：'breakthrough' | 'kill_mob' | 'enter_location' | ... */
  type: string;
  /** 时间戳（ms） */
  ts: number;
  /** 类型相关载荷：breakthrough→{success,newLevel,oldLevel}；kill_mob→{mobId,mobName,won}；enter_location→{locationId,locType,name} */
  payload: Record<string, any>;
}

/** 已注册的领域事件名常量（emit/on 时统一引用，避免拼写漂移） */
export const PLAYER_EVENTS = {
  BREAKTHROUGH: 'player.breakthrough',
  KILL_MOB: 'player.kill_mob',
  ENTER_LOCATION: 'player.enter_location',
} as const;

/** 构造一个 PlayerEvent 的便捷工厂 */
export function playerEvent(
  playerId: number,
  type: string,
  payload: Record<string, any> = {},
): PlayerEvent {
  return { playerId, type, ts: Date.now(), payload };
}
