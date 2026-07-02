import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnApplicationBootstrap } from '@nestjs/common';
import { EventDispatch } from './event-dispatch.entity';
import { EventInstanceService, EventSpec } from './event-instance.service';
import { EffectRegistry } from './effect-registry';
import { PlayerService } from '../player/player.service';
import { TaskService } from '../task/task.service';
import { AgentClient } from '../agent/agent.client';
import { PlayerEvent, PLAYER_EVENTS } from '../event-bus/events';

/**
 * 默认采样率（每种玩家事件触发 agent 编排的概率）与冷却时间。
 * 重事件（突破）100%、轻事件（击杀 10%、进地点 5%）。
 * 冷却：每玩家每事件类型独立，默认 30 分钟；通过查 event_dispatch 最近记录实现持久化冷却。
 */
const DEFAULT_SAMPLE: Record<string, number> = {
  breakthrough: 1.0,
  kill_mob: 0.1,
  enter_location: 0.05,
};
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * 事件类型 → 默认投递策略。突破这类"即时高光"用 immediate；其它倾向进地点触发。
 */
const DEFAULT_DELIVERY: Record<string, string> = {
  breakthrough: 'immediate',
  kill_mob: 'enter_location',
  enter_location: 'enter_location',
};

/** effect 数值钳制上限（按玩家等级动态算） */
function moneyCap(playerLevel: number): number {
  return Math.max(1000, playerLevel * 5000);
}

/**
 * AgentOrchestrator：监听玩家领域事件 → 门控 → 收集上下文 → 调 agent → 严格校验 → 入派发队列。
 *
 * 这是"agent 动态编排"的大脑。它被 EventEmitter2 同步触发，但 onEvent 内部异步处理，
 * 任何异常都被 try/catch 吞掉并记日志，绝不影响玩家主流程（突破/击杀/移动照常完成）。
 */
@Injectable()
export class AgentOrchestrator implements OnApplicationBootstrap {
  private readonly logger = new Logger(AgentOrchestrator.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly agent: AgentClient,
    private readonly eventInstanceService: EventInstanceService,
    private readonly effectRegistry: EffectRegistry,
    private readonly playerService: PlayerService,
    private readonly taskService: TaskService,
    private readonly config: ConfigService,
    @InjectRepository(EventDispatch)
    private readonly dispatchRepo: Repository<EventDispatch>,
  ) {}

  onApplicationBootstrap() {
    // 监听全部已注册的玩家领域事件，统一入口
    this.eventEmitter.on(PLAYER_EVENTS.BREAKTHROUGH, (e: PlayerEvent) => { void this.onEvent(e); });
    this.eventEmitter.on(PLAYER_EVENTS.KILL_MOB, (e: PlayerEvent) => { void this.onEvent(e); });
    this.eventEmitter.on(PLAYER_EVENTS.ENTER_LOCATION, (e: PlayerEvent) => { void this.onEvent(e); });
    this.logger.log('已订阅玩家领域事件，开始监听编排触发');
  }

  /** 单次编排流水线 */
  private async onEvent(e: PlayerEvent): Promise<void> {
    try {
      if (!(await this.gate(e))) return;

      const ctx = await this.buildContext(e);
      const spec = await this.agent.generateEvent(ctx);
      if (!spec) return;

      const validated = this.validate(spec as EventSpec, ctx);
      if (!validated) return;

      // 若 agent 没给投递策略，按事件类型给默认值
      if (!validated.delivery) validated.delivery = DEFAULT_DELIVERY[e.type] || 'immediate';

      await this.eventInstanceService.enqueueDispatch(e.playerId, validated);
    } catch (err) {
      // 降级策略：编排失败 = 本次不编排，等下个事件。绝不影响玩家主流程。
      this.logger.warn(`编排失败(player=${e.playerId}, type=${e.type}): ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------
  //  门控：采样 + 冷时间
  // ---------------------------------------------------------------
  private async gate(e: PlayerEvent): Promise<boolean> {
    // 采样
    const rate = this.sampleRate(e.type);
    if (Math.random() >= rate) return false;

    // 冷却：查该玩家最近一条 agent 派发记录，未过冷却则跳过（持久化冷却，重启不失效）
    const cooldown = this.config.get<number>('ORCH_COOLDOWN_MS', DEFAULT_COOLDOWN_MS);
    const since = new Date(Date.now() - cooldown);
    const last = await this.dispatchRepo.findOne({
      where: { player_id: e.playerId, source: 'agent' },
      order: { created_at: 'DESC' },
    });
    if (last && last.created_at.getTime() > since.getTime()) return false;
    return true;
  }

  private sampleRate(type: string): number {
    const key = `ORCH_SAMPLE_${type.toUpperCase()}`;
    return this.config.get<number>(key, DEFAULT_SAMPLE[type] ?? 0);
  }

  // ---------------------------------------------------------------
  //  上下文收集
  // ---------------------------------------------------------------
  private async buildContext(e: PlayerEvent): Promise<Record<string, any>> {
    const player = await this.playerService.findByIdRaw(e.playerId);
    const tasks = await this.taskService.findByPlayer(e.playerId, 'pending');
    return {
      trigger: {
        type: e.type,
        payload: e.payload,
      },
      player: player ? {
        name: player.name,
        level: player.level,
        money: player.money,
        levelName: '', // agent 端会按 level 自行换算
      } : null,
      pendingTaskCount: tasks.length,
      // effect 白名单传给 agent，约束其只用合法 key
      allowedEffects: this.effectRegistry.keys(),
    };
  }

  // ---------------------------------------------------------------
  //  偏严格校验：schema + effect 白名单 + 数值钳制
  // ---------------------------------------------------------------
  validate(spec: EventSpec, ctx: Record<string, any>): EventSpec | null {
    const reasons: string[] = [];

    // ① 顶层字段
    if (!spec || typeof spec !== 'object') { reasons.push('spec 非对象'); return this.reject(reasons); }
    if (!spec.title || typeof spec.title !== 'string') reasons.push('title 缺失');
    if (!spec.event_id || typeof spec.event_id !== 'string') {
      spec.event_id = `agent_${ctx.trigger?.type}_${Date.now()}`;
    }
    if (!spec.nodes || typeof spec.nodes !== 'object') {
      reasons.push('nodes 缺失');
      return this.reject(reasons);
    }

    // ② 节点图结构
    const nodeErr = this.validateNodeGraph(spec.nodes);
    if (nodeErr) reasons.push(nodeErr);

    // ③ effect 白名单 + 数值钳制
    const playerLevel = ctx.player?.level ?? 1;
    this.sanitizeNodeEffects(spec.nodes, playerLevel);

    if (reasons.length) return this.reject(reasons);
    return spec;
  }

  /** 校验节点图：必须有 start + map，map 内节点结构合法 */
  private validateNodeGraph(nodes: any): string | null {
    if (!nodes.map || typeof nodes.map !== 'object') return 'nodes.map 缺失';
    if (!nodes.start || !nodes.map[nodes.start]) return 'nodes.start 节点不存在';
    for (const [id, node] of Object.entries(nodes.map) as any) {
      if (!node || typeof node !== 'object') return `节点 ${id} 非对象`;
      // end 节点可以只有 npc；非 end 节点应有 choices 或 effects 或 roll 之一
      const hasExit = node.end === true;
      const hasBranch = Array.isArray(node.choices) || Array.isArray(node.effects) || Array.isArray(node.roll);
      if (!hasExit && !hasBranch) return `节点 ${id} 缺少 choices/effects/roll/end`;
    }
    return null;
  }

  /** 遍历节点图所有 effects：剔除非法 effect key，钳制数值 */
  private sanitizeNodeEffects(nodes: any, playerLevel: number): void {
    const cap = moneyCap(playerLevel);
    const map = nodes.map || {};
    for (const node of Object.values(map) as any[]) {
      if (!Array.isArray(node.effects)) continue;
      const cleaned: any[] = [];
      for (const eff of node.effects) {
        if (!eff || typeof eff !== 'object') continue;
        const key = Object.keys(eff).find(k => eff[k] !== undefined);
        if (!key) continue;
        if (!this.effectRegistry.has(key)) {
          this.logger.warn(`编排校验：剔除未注册 effect "${key}"`);
          continue;
        }
        // money 钳制
        if (key === 'money' && typeof eff.money === 'number') {
          eff.money = Math.max(-cap, Math.min(cap, eff.money));
        }
        // giveItem count 钳制
        if (key === 'giveItem' && eff.giveItem) {
          eff.giveItem.count = Math.max(1, Math.min(99, Number(eff.giveItem.count) || 1));
        }
        // grantCultivation 钳制
        if (key === 'grantCultivation' && eff.grantCultivation) {
          eff.grantCultivation.amount = Math.max(-100000, Math.min(100000, Number(eff.grantCultivation.amount) || 0));
        }
        cleaned.push(eff);
      }
      node.effects = cleaned;
    }
  }

  private reject(reasons: string[]): null {
    this.logger.warn(`编排校验拒绝: ${reasons.join('; ')}`);
    return null;
  }
}
