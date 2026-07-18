import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScriptOutline } from './script-outline.entity';
import { ScriptInstance } from './script-instance.entity';
import { matchConditions, ContextEntry } from './condition-engine';
import { ScriptSseService } from './script-sse.service';
import { DynamicNpcService } from '../npc/dynamic-npc.service';
import { PlayerService, PLAYER_STATUS } from '../player/player.service';
import { Biz } from '../common/biz.exception';
import { SCRIPT_HOOK_EVENT, SCRIPT_TRIGGER_EVENT } from './script.constants';

/** SSE 推送用的事件名（通用 event 通道，前端按此分发）。 */
export { SCRIPT_TRIGGER_EVENT };

export interface ScriptHookPayload {
  hook: string;
  playerId: number;
  context: ContextEntry[];
}

/**
 * 剧本触发引擎。
 *
 * 触发流程分两段（关键：锁状态必须同步，选角可以异步）：
 *
 *   【同步段 tryTrigger】钩子点直接 await 调用，必须在主操作（如 enterScene）return 前完成：
 *     条件判断 → 概率掘骰 → 防重复 → 【立即锁玩家状态】→ 返回命中列表
 *     这段只做 DB 查询 + 状态更新（毫秒级），保证「触发即锁」。
 *
 *   【异步段 prepareInstance】锁状态后 fire-and-forget，不阻塞主业务 return：
 *     选角(acquire，可能调 LLM 耗时) → 建映射 → 建实例 → 移动 NPC → SSE 推送
 *
 * 异常处理（与项目日志写入风格一致）：**吞掉，绝不影响主业务**。
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
    private readonly dynamicNpc: DynamicNpcService,
    private readonly playerService: PlayerService,
  ) {}

  /**
   * 事件总线监听（兼容仍走 emit 的入口）。
   * 注意：@OnEvent 对 async 监听器是 fire-and-forget，不等 promise。
   *       因此需要「触发即锁」的钩子点应直接 await tryTrigger，不要依赖本监听器。
   */
  @OnEvent(SCRIPT_HOOK_EVENT)
  async onHook(payload: ScriptHookPayload): Promise<void> {
    try {
      await this.tryTrigger(payload);
    } catch (e) {
      this.logger.error(
        `剧本触发异常（已忽略，不影响主业务）hook=${payload?.hook}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * 【同步段】触发判断 + 立即锁状态。钩子点应 await 本方法。
   *
   * 流程：查匹配剧本 → 条件判断 → 概率掘骰 → 防重复 → 【锁玩家状态】→ 返回命中列表。
   * 命中后立即异步启动 prepareInstance（选角+推送），不阻塞本方法返回。
   *
   * @returns 命中的剧本 outline 列表（已锁状态；异步准备中）
   */
  async tryTrigger(payload: ScriptHookPayload): Promise<ScriptOutline[]> {
    const { hook, playerId, context } = payload;
    if (!hook || !playerId) return [];

    // 1. 查所有绑了该 hook 的剧本
    const outlines = await this.outlineRepo.find({ where: { hook } });
    if (outlines.length === 0) return [];

    const hit: ScriptOutline[] = [];
    for (const outline of outlines) {
      // 2. 条件判断
      const conds = this.normalizeConditions(outline.trigger_conditions);
      if (!matchConditions(conds, context)) continue;

      // 3. 概率掘骰
      const rate = typeof outline.trigger_rate === 'number' ? outline.trigger_rate : 100;
      const clampedRate = Math.max(0, Math.min(100, rate));
      if (clampedRate < 100 && Math.random() * 100 >= clampedRate) continue;

      // 4. 防重复
      const active = await this.instanceRepo.findOne({
        where: { player_id: playerId, outline_id: outline.id, status: 'pending' },
      });
      if (active) continue;

      // 5. 【立即锁玩家状态】——触发即锁，不等选角
      const player = await this.playerService.getEntity(playerId);
      if (!player) continue;
      const fromStatus = player.status;
      try {
        await this.playerService.setStatus(playerId, PLAYER_STATUS.SCRIPT);
      } catch (e) {
        this.logger.error(`锁玩家状态失败 player=${playerId}: ${(e as Error).message}`);
        continue;
      }
      hit.push(outline);

      // 6. 异步准备实例（选角+映射+移动NPC+建实例+推送），不 await
      //    fire-and-forget：本方法立即返回，钩子点 return 时玩家已锁
      this.prepareInstance(outline, playerId, hook, context, fromStatus).catch((e) => {
        this.logger.error(`prepareInstance 异常 outline=${outline.id} player=${playerId}: ${(e as Error).message}`);
        // 准备失败时恢复玩家状态，避免锁死
        this.playerService.setStatus(playerId, fromStatus).catch(() => {});
      });
    }
    return hit;
  }

  /**
   * 【异步段】选角 + 建映射 + 移动 NPC + 建实例 + SSE 推送。
   * 由 tryTrigger 命中后 fire-and-forget 调用，不阻塞主业务。
   */
  private async prepareInstance(
    outline: ScriptOutline,
    playerId: number,
    hook: string,
    context: ContextEntry[],
    fromStatus: number,
  ): Promise<ScriptInstance | null> {
    try {
      const player = await this.playerService.getEntity(playerId);
      if (!player) return null;

      // 选角 + 建映射
      const actorMap = this.parseActorMap(outline);
      const locationMap = this.parseLocationMap(outline);
      const mapping = await this.castActors(actorMap, playerId, player);

      // 地点映射：本轮全填玩家当前位置
      const locEntry = this.playerLocationEntry(player);
      for (const locKey of Object.keys(locationMap)) {
        mapping[locKey] = locEntry;
      }
      mapping['player'] = { type: 'player', id: playerId };

      // 起始节点
      const startNode = this.extractStartNode(outline);

      // 建实例（pending：锁定但还在准备）
      const instance = await this.instanceRepo.save(
        this.instanceRepo.create({
          outline_id: outline.id,
          story_id: outline.story_id,
          player_id: playerId,
          hook,
          current_node: startNode,
          node_path: startNode ? [startNode] : [],
          actor_mapping: mapping,
          from_status: fromStatus,
          status: 'pending',
          trigger_payload: context,
        }),
      );

      // 移动当前节点(start)出场 NPC 到对应位置
      await this.moveActorsToNode(outline, startNode, mapping);

      // 准备完成（选角+映射+移动NPC 都做完）→ 状态置为 playing（进行中）
      instance.status = 'playing';
      await this.instanceRepo.update(instance.id, { status: 'playing' });

      // SSE 通知前端「准备完成」：只带 instance_id，前端拿 id 调接口查节点详情
      this.sse.push(playerId, SCRIPT_TRIGGER_EVENT, {
        instance_id: instance.id,
        status: 'playing',
      });
      return instance;
    } catch (e) {
      this.logger.error(`prepareInstance 失败 outline=${outline.id} player=${playerId}: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * 查询某剧本实例的当前节点完整信息（供前端演出渲染）。
   *
   * 返回：
   *   { instance_id, node_id, lines, choices?, end?, location, actors }
   *   - actors：只含该节点 node.actors 里的演员，每个解析成真实信息
   *     · player：{key:'player', type:'player', info:{id}}
   *     · 配角：{key, type:'dynamic_npc', info:{id,name,gender,role,nature,...}}（从 dynamic_npc 查）
   *     · 选角失败的配角：{key, type:null, info:null}
   *   - location：节点 location 映射后的 {type, id}（前端按需查场景/节点详情）
   *
   * 校验：instance 必须存在 + 归属该玩家 + status=playing。
   */
  async getCurrentNode(instanceId: number, playerId: number): Promise<any> {
    const instance = await this.instanceRepo.findOneBy({ id: instanceId });
    if (!instance) throw Biz.notFound(`剧本实例 ${instanceId} 不存在`);
    if (instance.player_id !== playerId) throw Biz.forbidden('无权访问该剧本实例');
    if (instance.status !== 'playing') {
      throw Biz.conflict(`剧本实例状态为 ${instance.status}，无法演出（须 playing）`);
    }

    const outline = await this.outlineRepo.findOneBy({ id: instance.outline_id });
    if (!outline) throw Biz.notFound(`剧本大纲 ${instance.outline_id} 不存在`);

    const nodeMap = this.parseNodeMap(outline);
    const nodeId = instance.current_node;
    if (!nodeId) throw Biz.conflict('剧本实例无 current_node');
    const node = nodeMap[nodeId];
    if (!node) throw Biz.notFound(`节点 ${nodeId} 不存在`);

    const mapping = this.parseMapping(instance.actor_mapping);

    // 解析该节点出场 actors 的真实信息
    const nodeActorKeys: string[] = Array.isArray(node.actors) ? node.actors : [];
    const actors = await Promise.all(
      nodeActorKeys.map(async (key) => {
        if (key === 'player') {
          return { key, type: 'player', info: { id: playerId } };
        }
        const mapped = mapping[key];
        if (!mapped || mapped.type !== 'dynamic_npc') {
          return { key, type: null, info: null }; // 选角失败
        }
        try {
          const npcInfo = await this.dynamicNpc.findOne(mapped.id);
          return { key, type: 'dynamic_npc', info: npcInfo };
        } catch {
          return { key, type: 'dynamic_npc', info: null };
        }
      }),
    );

    // 节点 location 映射
    const locationMapped = mapping[node.location] || null;

    return {
      instance_id: instance.id,
      story_id: instance.story_id,
      title: outline.title,
      node_id: nodeId,
      lines: node.lines || [],
      choices: node.choices || null,
      end: node.end || false,
      location: locationMapped,
      actors,
    };
  }

  /** instance.actor_mapping 规整。 */
  private parseMapping(raw: any): Record<string, { type: string; id: number }> {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        const obj = JSON.parse(raw);
        return (obj && typeof obj === 'object') ? obj : {};
      } catch {
        return {};
      }
    }
    return (raw && typeof raw === 'object') ? raw : {};
  }

  /**
   * 同步选角：遍历 actor_map 的配角（非 player），调 acquire 匹配 or 创建动态NPC。
   * acquire 失败（如 20 上限 / agent 挂）→ 该演员映射留空，不阻断。
   * 返回 {actor_key: {type:'dynamic_npc', id}} 的部分映射（不含玩家/地点）。
   */
  private async castActors(
    actorMap: Record<string, any>,
    playerId: number,
    player: any,
  ): Promise<Record<string, { type: string; id: number }>> {
    const mapping: Record<string, { type: string; id: number }> = {};
    // 选角位置参数：玩家在场景用 scene_id，否则用 location_id
    const locSceneId = player.scene_id ?? null;
    const locNetId = player.location_id ?? null;

    for (const [actorKey, info] of Object.entries(actorMap)) {
      if (actorKey === 'player') continue; // 玩家不选角
      const role = info?.role || '';
      if (!role) continue;
      try {
        const acquired = await this.dynamicNpc.acquire({
          role_name: role,
          nature: info?.nature || undefined,
          loc_scene_id: locSceneId ?? undefined,
          loc_net_id: locSceneId == null ? locNetId ?? undefined : undefined,
          prefer_existing: true,
          ref_type: 'script',
          ref_id: playerId,
        });
        if (acquired?.id) {
          mapping[actorKey] = { type: 'dynamic_npc', id: acquired.id };
        }
      } catch (e) {
        // 选角失败（如 20 上限）：该演员留空，不阻断其它选角
        this.logger.warn(
          `选角失败 actor=${actorKey} role=${role}: ${(e as Error).message}`,
        );
      }
    }
    return mapping;
  }

  /**
   * 移动某节点的出场动态 NPC 到该节点的 location 映射位置。
   *
   * 流程：
   *   1. 从 outline.nodes.map[nodeId] 取 actors 列表 + location key
   *   2. 按 location key 从 mapping 找到目标位置 {type, id}
   *   3. 遍历 actors（排除 player），按 actor key 从 mapping 拿到 npc id
   *   4. 调 dynamicNpc.update 把 npc 移到目标位置
   *
   * 容错：单次移动失败只 warn，不阻断（其它 npc 仍移动，instance 仍建好）。
   * player 不移动（玩家位置由剧本演出机制另行管理）。
   */
  private async moveActorsToNode(
    outline: ScriptOutline,
    nodeId: string | null,
    mapping: Record<string, { type: string; id: number }>,
  ): Promise<void> {
    if (!nodeId) return;
    const nodeMap = this.parseNodeMap(outline);
    const node = nodeMap[nodeId];
    if (!node) return;

    // 节点的 location key（如 'story_xxx_loc1'）→ 目标位置
    const nodeLocKey = node.location;
    const target = mapping[nodeLocKey];
    if (!target) {
      // 该节点 location 没有映射（本轮地点全填当前位置，正常应有）
      return;
    }

    // 构造 update 的位置参数：location_scene / location_net 二选一
    const locPatch: { location_net_id: number | null; location_scene_id: number | null } =
      target.type === 'location_scene'
        ? { location_net_id: null, location_scene_id: target.id }
        : { location_net_id: target.id, location_scene_id: null };

    // 遍历该节点出场 actors，移动 dynamic_npc（player 跳过）
    const actors: string[] = Array.isArray(node.actors) ? node.actors : [];
    for (const actorKey of actors) {
      if (actorKey === 'player') continue;
      const mapped = mapping[actorKey];
      if (!mapped || mapped.type !== 'dynamic_npc') continue; // 选角失败的 actor 无映射
      try {
        await this.dynamicNpc.update(mapped.id, locPatch);
      } catch (e) {
        this.logger.warn(
          `移动NPC失败 actor=${actorKey} npc=${mapped.id}: ${(e as Error).message}`,
        );
      }
    }
  }

  /** outline.nodes.map 规整为对象。 */
  private parseNodeMap(outline: ScriptOutline): Record<string, any> {
    const nodes = outline.nodes;
    if (!nodes || typeof nodes !== 'object') return {};
    const map = (nodes as any).map;
    return (map && typeof map === 'object') ? map : {};
  }

  /** 玩家当前位置的映射条目：在场景→location_scene，否则→location_net。 */
  private playerLocationEntry(player: any): { type: string; id: number } {
    if (player.scene_id != null) {
      return { type: 'location_scene', id: player.scene_id };
    }
    // scene_id 为空：用 location_id（location_net 节点）
    return { type: 'location_net', id: player.location_id };
  }

  /** 从 outline.nodes.start 取起始节点 id；nodes 结构非法时返回 null。 */
  private extractStartNode(outline: ScriptOutline): string | null {
    const nodes = outline.nodes;
    if (!nodes || typeof nodes !== 'object') return null;
    const start = (nodes as any).start;
    return typeof start === 'string' ? start : null;
  }

  /** outline.actor_map 可能是对象/JSON 字符串/null，规整为对象。 */
  private parseActorMap(outline: ScriptOutline): Record<string, any> {
    return this.parseJson(outline.actor_map);
  }

  /** outline.location_map 规整。 */
  private parseLocationMap(outline: ScriptOutline): Record<string, any> {
    return this.parseJson(outline.location_map);
  }

  private parseJson(raw: any): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        const obj = JSON.parse(raw);
        return typeof obj === 'object' && obj ? obj : {};
      } catch {
        return {};
      }
    }
    return typeof raw === 'object' && raw ? raw : {};
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



