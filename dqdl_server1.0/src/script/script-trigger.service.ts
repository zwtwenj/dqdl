import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScriptOutline } from './script-outline.entity';
import { ScriptInstance } from './script-instance.entity';
import { matchConditions, ContextEntry } from './condition-engine';
import { ScriptSseService } from './script-sse.service';

/**
 * 统一钩子事件名：5 个游戏钩子（突破/进入场景/...）都 emit 这个事件。
 * payload = { hook, playerId, context:[{type,data}] }
 */
export const SCRIPT_HOOK_EVENT = 'script.hook';

export interface ScriptHookPayload {
  hook: string;
  playerId: number;
  context: ContextEntry[];
}

/**
 * 剧本触发引擎：监听游戏钩子，按「条件 + 概率」匹配 script_outline。
 *
 * 命中后的处理（本轮）：
 *   1. 防重复：同玩家+同剧本(outline_id)有 status='pending' 记录时跳过
 *   2. 写 script_instance（status=pending，current_node=剧本 start 节点，node_path=[start]）
 *   3. SSE 推送给该玩家（前端弹提示/演出）
 *
 * 异常处理（与项目日志写入风格一致）：**吞掉，绝不影响主业务**。
 *   触发/写库/SSE 任一失败最多是「玩家这次没收到」，不能让主流程（突破/进入场景）报错。
 */
@Injectable()
export class ScriptTriggerService {
  private readonly logger = new Logger(ScriptTriggerService.name);

  constructor(
    @InjectRepository(ScriptOutline)
    private readonly outlineRepo: Repository<ScriptOutline>,
    @InjectRepository(ScriptInstance)
    private readonly instanceRepo: Repository<ScriptInstance>,
    private readonly sse: ScriptSseService,
  ) {}

  /**
   * 监听所有游戏钩子。@OnEvent 默认同步——异常会冒泡到 emit 方，
   * 因此本方法内部 try/catch 吞掉异常，避免污染主业务流程。
   */
  @OnEvent(SCRIPT_HOOK_EVENT)
  async onHook(payload: ScriptHookPayload): Promise<void> {
    try {
      await this.check(payload);
    } catch (e) {
      // 关键：剧本触发异常绝不能影响主业务（仅 error 级日志，不是业务事件）
      this.logger.error(
        `剧本触发判断异常（已忽略，不影响主业务）hook=${payload?.hook}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * 核心：查匹配该 hook 的所有剧本 → 逐个比对条件 + 概率掘骰 → 命中则
   *      防重复检查 → 建实例 → SSE 推送。
   * 可被直接调用（绕过事件总线，便于测试）。
   */
  async check(payload: ScriptHookPayload): Promise<ScriptInstance[]> {
    const { hook, playerId, context } = payload;
    if (!hook || !playerId) return [];

    // 1. 查所有绑了该 hook 的剧本（hook 非空）
    const outlines = await this.outlineRepo.find({ where: { hook } });
    if (outlines.length === 0) return [];

    const created: ScriptInstance[] = [];
    for (const outline of outlines) {
      // 2. 条件判断
      const conds = this.normalizeConditions(outline.trigger_conditions);
      if (!matchConditions(conds, context)) continue;

      // 3. 概率掘骰（rate 为 null/100 或未配 = 必定触发）
      const rate = typeof outline.trigger_rate === 'number' ? outline.trigger_rate : 100;
      const clampedRate = Math.max(0, Math.min(100, rate));
      if (clampedRate < 100 && Math.random() * 100 >= clampedRate) {
        continue; // 未命中概率
      }

      // 4. 防重复：同玩家+同剧本有进行中(pending)记录 → 跳过
      const active = await this.instanceRepo.findOne({
        where: { player_id: playerId, outline_id: outline.id, status: 'pending' },
      });
      if (active) {
        // 该剧本玩家还在演出中，不重复触发
        continue;
      }

      // 5. 建实例：current_node=剧本 start，node_path=[start]
      const startNode = this.extractStartNode(outline);
      const instance = await this.instanceRepo.save(
        this.instanceRepo.create({
          outline_id: outline.id,
          story_id: outline.story_id,
          player_id: playerId,
          hook,
          current_node: startNode,
          node_path: startNode ? [startNode] : [],
          status: 'pending',
          trigger_payload: context,
        }),
      );
      created.push(instance);

      // 6. SSE 推送给该玩家（连接不存在/失败静默忽略）
      this.sse.push(playerId, {
        instance_id: instance.id,
        outline_id: outline.id,
        story_id: outline.story_id,
        title: outline.title,
        hook,
        current_node: startNode,
      });
    }
    return created;
  }

  /** 从 outline.nodes.start 取起始节点 id；nodes 结构非法时返回 null。 */
  private extractStartNode(outline: ScriptOutline): string | null {
    const nodes = outline.nodes;
    if (!nodes || typeof nodes !== 'object') return null;
    const start = (nodes as any).start;
    return typeof start === 'string' ? start : null;
  }

  /** trigger_conditions 可能是对象/JSON 字符串/null，统一规整为对象或 null。 */
  private normalizeConditions(raw: any): any {
    if (!raw) return null;
    if (typeof raw === 'string') {
      try {
        const obj = JSON.parse(raw);
        return typeof obj === 'object' ? obj : null;
      } catch {
        return null;
      }
    }
    return typeof raw === 'object' ? raw : null;
  }
}



