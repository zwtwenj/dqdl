import { Injectable, Logger } from '@nestjs/common';

/**
 * 效果执行上下文：每个 effect handler 在执行时可获得的现场信息。
 * locationId 通常来自当前事件的 check() 上下文（玩家所在地点）。
 * out 是可变的产出收集器：handler 把需要回传给调用方/前端的产出写进 out（如 startBattle 的 mobId）。
 */
export interface EffectContext {
  locationId?: number;
  out?: {
    battleMobId?: string;
    [k: string]: any;
  };
}

/**
 * 单条 effect：以"唯一 key + 任意载荷"的形式存在。
 * key 必须在注册表中登记，否则编排校验层会拒绝整条事件。
 *
 * 已注册的 key（与 app.py prompt 中的白名单保持一致）：
 *   money                { money: ±n }
 *   giveItem             { name: string, count: number }
 *   forgeTask            true
 *   createTask           { name, desc, target[], reward[], type?, delivery?, star? }
 *   startBattle          { mobId: string }
 *   grantCultivation     { amount: ±n }
 *   triggerEncounter     { force?: true }
 *   movePlayer           { position: number[] }
 */
export type EffectPayload = Record<string, any>;

export interface EffectHandler {
  key: string;
  /** 执行单个 effect。失败应抛错，由 runAll 收集日志后继续后续 effect。允许返回任意值（忽略）。 */
  apply: (playerId: number, params: EffectPayload, ctx: EffectContext) => Promise<unknown>;
}

/**
 * 效应注册表：节点图 node.effects 里的每条 effect 按其 key 路由到对应 handler。
 *
 * 设计意图：把原本散落在 RandomEventService.apply() 里的 switch 逻辑开放成可扩展的注册表，
 * 新增原子能力只需 register({key, apply})，agent 编排能力随之扩展。
 */
@Injectable()
export class EffectRegistry {
  private readonly logger = new Logger(EffectRegistry.name);
  private readonly handlers = new Map<string, EffectHandler>();

  register(h: EffectHandler) {
    this.handlers.set(h.key, h);
  }

  /** 是否已注册该 key（编排校验层据此判断 effect 是否合法） */
  has(key: string): boolean {
    return this.handlers.has(key);
  }

  /** 返回所有已注册 key（供 agent prompt 与校验同步） */
  keys(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * 批量执行一组 effect。逐条调用，单条失败仅记日志不中断（保证玩家体验）。
   */
  async runAll(playerId: number, effects: any[], ctx: EffectContext): Promise<void> {
    if (!ctx.out) ctx.out = {};
    for (const eff of effects || []) {
      if (!eff || typeof eff !== 'object') continue;
      // 每条 effect 形如 { money: -100 } / { giveItem: {...} }，取第一个 key 作为路由键
      const key = Object.keys(eff).find(k => eff[k] !== undefined);
      if (!key) continue;
      const handler = this.handlers.get(key);
      if (!handler) {
        this.logger.warn(`未注册的 effect key "${key}"，跳过`);
        continue;
      }
      try {
        await handler.apply(playerId, eff[key] ?? {}, ctx);
      } catch (e) {
        this.logger.error(`effect "${key}" 执行失败: ${(e as Error).message}`);
      }
    }
  }
}
