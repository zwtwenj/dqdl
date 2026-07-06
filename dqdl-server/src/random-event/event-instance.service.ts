import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EventTemplate } from './event-template.entity';
import { EventInstance } from './event-instance.entity';
import { EventDispatch } from './event-dispatch.entity';
import { PlayerService } from '../player/player.service';
import { BackpackService } from '../backpack/backpack.service';
import { TaskService, TaskTarget, TaskReward } from '../task/task.service';
import { BattleService } from '../battle/battle.service';
import { EncounterService } from '../encounter/encounter.service';
import { MobService } from '../mob/mob.service';
import { EffectRegistry, EffectContext } from './effect-registry';

/**
 * 向后兼容：保留 EventEffect 联合类型供 controller/前端契约不变。
 * 实际 effect 执行已下沉到 EffectRegistry（支持任意注册 key）。
 */
export interface EventEffect {
  money?: number;
  giveItem?: { name: string; count: number };
  forgeTask?: boolean;
  [k: string]: any;
}

/** 触发 payload 契约（按 trigger_type 携带不同字段） */
export interface TriggerPayload {
  locType?: string;
  name?: string;
  availableActions?: string[];
  playerLevel?: number;
  success?: boolean;
  star?: number;
  taskKind?: string;
  [k: string]: any;
}

/** agent 编排产出的事件规格（/generate/event 返回值） */
export interface EventSpec {
  event_id: string;
  title: string;
  trigger_type?: string;
  nodes: any;            // 节点图 { start, map }
  delivery?: string;     // immediate / enter_location / condition_met
  fire_conditions?: any; // 派发条件 JSON
  reason?: string;
}

@Injectable()
export class EventInstanceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EventInstanceService.name);

  /** 应用启动后注册全部 effect 原子能力 */
  onApplicationBootstrap() {
    this.registerEffects();
  }

  constructor(
    @InjectRepository(EventTemplate)
    private readonly repo: Repository<EventTemplate>,
    @InjectRepository(EventInstance)
    private readonly logRepo: Repository<EventInstance>,
    @InjectRepository(EventDispatch)
    private readonly dispatchRepo: Repository<EventDispatch>,
    private readonly playerService: PlayerService,
    private readonly backpackService: BackpackService,
    private readonly taskService: TaskService,
    private readonly battleService: BattleService,
    private readonly encounterService: EncounterService,
    private readonly mobService: MobService,
    private readonly effectRegistry: EffectRegistry,
  ) {}

  // ---------------------------------------------------------------
  //  effect 注册：onModuleInit 时把全部原子能力注册进注册表
  // ---------------------------------------------------------------
  registerEffects(): void {
    const r = this.effectRegistry;
    // 金钱（负数即扣除，自动夹到 0）
    r.register({
      key: 'money',
      apply: async (pid, params) => {
        let delta = Number(params) || 0;
        if (!delta) return;
        if (delta < 0) {
          const p = await this.playerService.findByIdRaw(pid);
          const cur = p?.money ?? 0;
          if (cur + delta < 0) delta = -cur;
        }
        await this.playerService.grantMoney(pid, delta);
      },
    });
    // 物品发放
    r.register({
      key: 'giveItem',
      apply: (pid, params) => this.backpackService.addItem(pid, String(params?.name), Number(params?.count) || 1),
    });
    // 锻造委托（需要 ctx.locationId）
    r.register({
      key: 'forgeTask',
      apply: (pid, _params, ctx) => {
        if (!ctx?.locationId) return Promise.resolve();
        return this.taskService.acceptForgeTask(pid, ctx.locationId);
      },
    });
    // 创建任意任务
    r.register({
      key: 'createTask',
      apply: (pid, params) => this.taskService.create(
        pid,
        String(params?.name || '神秘委托'),
        String(params?.desc || ''),
        (params?.target || []) as TaskTarget[],
        (params?.reward || []) as TaskReward[],
        String(params?.type || 'common'),
        params?.delivery ?? null,
        Number(params?.star) || 1,
      ),
    });
    // 发起一场战斗（玩家 vs 对手）。三种入参：
    //  ① {mobId:"WB-001"}            直接用图鉴里的魔兽（必须已存在）
    //  ② {name,level,power,...}       agent 生成对手属性，建 AGENT- 前缀 mob 记录
    //  ③ {mobId:"black_bandit"}      agent 编造的 mobId 但 mob 表无此记录 → 自动按 mobId 为名建记录
    r.register({
      key: 'startBattle',
      apply: async (pid, params, ctx) => {
        let mobId = String(params?.mobId || '');
        // 情况②：agent 明确生成对手属性
        if (!mobId && params?.name) {
          mobId = `AGENT-${Date.now().toString(36)}`;
          await this.ensureMobRecord(mobId, params, pid);
        }
        // 情况①③：给了 mobId。校验是否存在，不存在则按 mobId 为名自动建（按玩家等级给默认属性）
        if (mobId) {
          const existing = await this.mobService.findByMobId(mobId);
          if (!existing) {
            // agent 编造的 mobId（非图鉴），以 mobId 当名字建一条，属性按玩家等级推算
            const player = await this.playerService.findByIdRaw(pid);
            const pLevel = player?.level || 1;
            await this.ensureMobRecord(mobId, {
              name: mobId,
              description: '神秘对手',
              level: pLevel,
              power: Math.round((player?.power || 50) * 0.9),
              intelligence: Math.round((player?.intelligence || 50) * 0.9),
              quick: Math.round((player?.quick || 50) * 0.9),
              stamina: Math.round((player?.stamina || 50) * 0.9),
            }, pid);
          }
        }
        if (!mobId) throw new Error('startBattle 缺少 mobId 或对手属性');
        // 不在此处 battleService.start（避免玩家在 apply 阶段就进战斗，时序错乱）。
        // 仅建好 mob 并把 mobId 回传给前端，前端拿到后调 battle.open(mobId) 开战。
        if (ctx?.out) ctx.out.battleMobId = mobId;
      },
    });
    // 一次性增减修为（自动夹上限）
    r.register({
      key: 'grantCultivation',
      apply: (pid, params) => this.playerService.grantCultivation(pid, Number(params?.amount) || 0),
    });
    // 强制触发一次奇遇（绕过 10% 概率，仍受 pending 上限约束）
    r.register({
      key: 'triggerEncounter',
      apply: (pid) => this.encounterService.generateForced(pid),
    });
    // 移动玩家（校验非活动中）
    r.register({
      key: 'movePlayer',
      apply: (pid, params) => this.playerService.updatePosition(pid, JSON.stringify(params?.position || [])),
    });
    this.logger.log(`effect 注册表已注册 ${r.keys().length} 个原子能力: ${r.keys().join(', ')}`);
  }

  /** 按 params 建/更新 mob 记录（写四维+等级+名字+描述）。供 startBattle effect 复用。 */
  private async ensureMobRecord(mobId: string, params: any, _pid: number): Promise<void> {
    const level = Math.max(1, Math.min(99, Number(params.level) || 1));
    await this.mobService.findOrCreate(mobId, String(params.name || mobId), String(params.description || ''));
    const mob = await this.mobService.findByMobId(mobId);
    if (mob) {
      mob.level = level;
      mob.power = Math.max(0, Math.min(99999, Number(params.power) || 0));
      mob.intelligence = Math.max(0, Math.min(99999, Number(params.intelligence) || 0));
      mob.quick = Math.max(0, Math.min(99999, Number(params.quick) || 0));
      mob.stamina = Math.max(0, Math.min(99999, Number(params.stamina) || 0));
      await this.mobService.save(mob);
    }
  }

  // ---------------------------------------------------------------
  //  触发检测（概率事件）+ 派发消费（agent 编排事件）
  // ---------------------------------------------------------------

  /**
   * 触发检测：先消费待派发的 agent 事件（enter_location 类，命中即返回），
   * 再按 trigger_type 取模板候选 → 按 weight 降序 → 逐条匹配 conditions
   * → 命中则 roll chance，第一个掷中的即返回其节点图。无命中返回 null。
   */
  async check(
    playerId: number,
    triggerType: string,
    payload: TriggerPayload,
  ): Promise<{ event_id: string; title: string; nodes: any } | null> {
    // ① 优先消费 agent 编排、待派发且匹配当前条件的事件
    const fired = await this.fireDueDispatches(playerId, triggerType, payload);
    if (fired) return fired;

    // ② 走原有的概率模板匹配
    const candidates = await this.repo.find({
      where: { trigger_type: triggerType, enabled: 1 },
      order: { weight: 'DESC', id: 'ASC' },
    });

    for (const ev of candidates) {
      let cond: any = {};
      try {
        cond = JSON.parse(ev.conditions || '{}');
      } catch {
        continue;
      }
      if (!this.matchConditions(cond, payload)) continue;

      // 仅触发一次的事件：已记录则跳过
      if (ev.once) {
        const logged = await this.logRepo.findOne({
          where: { player_id: playerId, event_id: ev.event_id },
        });
        if (logged) continue;
      }

      if (Math.random() <= Number(ev.chance)) {
        let nodes: any = {};
        try {
          nodes = JSON.parse(ev.nodes || '{}');
        } catch {
          nodes = {};
        }
        await this.logRepo.save(
          this.logRepo.create({
            player_id: playerId,
            event_id: ev.event_id,
            status: 'started',
            process: JSON.stringify({ messages: [], choices: [], ended: false, path: [] }),
          }),
        );
        this.logger.log(`玩家 ${playerId} 触发事件 ${ev.event_id} (${triggerType})`);
        return { event_id: ev.event_id, title: ev.title, nodes };
      }
    }
    return null;
  }

  /**
   * 消费待派发队列里匹配当前条件的 agent 事件，转为 event_instance 并返回节点图。
   * 仅处理 enter_location / condition_met（immediate 由 enqueueImmediateOnOrchestrated 处理）。
   * 命中第一条即返回，其余保留待后续。
   */
  private async fireDueDispatches(
    playerId: number,
    triggerType: string,
    payload: TriggerPayload,
  ): Promise<{ event_id: string; title: string; nodes: any } | null> {
    if (triggerType !== 'enter_location') return null;
    const pendings = await this.dispatchRepo.find({
      where: { player_id: playerId, status: 'pending', delivery: In(['enter_location', 'condition_met']) },
      order: { id: 'ASC' },
    });
    for (const d of pendings) {
      let cond: any = {};
      try { cond = JSON.parse(d.fire_conditions || '{}'); } catch { cond = {}; }
      if (!this.matchConditions(cond, payload)) continue;

      let nodes: any = {};
      try { nodes = JSON.parse(d.nodes || '{}'); } catch { nodes = {}; }
      await this.logRepo.save(this.logRepo.create({
        player_id: playerId,
        event_id: d.event_id,
        status: 'started',
        process: JSON.stringify({ messages: [], choices: [], ended: false, path: [] }),
      }));
      d.status = 'fired';
      await this.dispatchRepo.save(d);
      this.logger.log(`玩家 ${playerId} 派发 agent 编排事件 ${d.event_id} (dispatch#${d.id})`);
      return { event_id: d.event_id, title: d.title, nodes };
    }
    return null;
  }

  /**
   * 把 agent 编排产出的事件规格写入派发队列。
   * delivery=immediate 时立即转为 event_instance；否则入队等 fireDueDispatches 消费。
   * 同时把模板写一份到 event_template（source=agent, once=0），便于复用与 getCurrent 回查 nodes。
   */
  async enqueueDispatch(playerId: number, spec: EventSpec): Promise<void> {
    const eventId = String(spec.event_id || `agent_${Date.now()}`);
    const title = String(spec.title || '奇遇');
    const nodesJson = JSON.stringify(spec.nodes || {});
    const delivery = String(spec.delivery || 'immediate');
    const fireConditions = JSON.stringify(spec.fire_conditions || {});

    // 写模板（若 event_id 已存在则跳过，避免覆盖手工模板）
    const exist = await this.repo.findOne({ where: { event_id: eventId } });
    if (!exist) {
      await this.repo.save(this.repo.create({
        event_id: eventId,
        title,
        trigger_type: spec.trigger_type || 'enter_location',
        chance: 0,
        conditions: '{}',
        nodes: nodesJson,
        weight: 0,
        once: 0,
        handler: null,
        enabled: 1,
        source: 'agent',
        trigger_kind: 'push',
      }));
    }

    if (delivery === 'immediate') {
      // 立即转为实例，玩家下次 getCurrent/resumeInProgress 时弹出
      await this.logRepo.save(this.logRepo.create({
        player_id: playerId,
        event_id: eventId,
        status: 'started',
        process: JSON.stringify({ messages: [], choices: [], ended: false, path: [] }),
      }));
      this.logger.log(`玩家 ${playerId} 立即派发 agent 事件 ${eventId}`);
      return;
    }

    await this.dispatchRepo.save(this.dispatchRepo.create({
      player_id: playerId,
      event_id: eventId,
      title,
      nodes: nodesJson,
      delivery,
      fire_conditions: fireConditions,
      fire_at: null,
      status: 'pending',
      source: 'agent',
      reason: spec.reason || null,
    }));
    this.logger.log(`玩家 ${playerId} 入队 agent 事件 ${eventId} (delivery=${delivery})`);
  }

  // ---------------------------------------------------------------
  //  effect 落地（注册表执行）
  // ---------------------------------------------------------------

  /**
   * 落地一批 effect（经 EffectRegistry 路由）。返回刷新后的金币与背包，供前端刷新。
   */
  async apply(
    playerId: number,
    effects: EventEffect[],
    context?: { locationId?: number },
  ): Promise<{ money: number; items: any[]; battleMobId?: string }> {
    const ctx: EffectContext = { locationId: context?.locationId };
    await this.effectRegistry.runAll(playerId, effects || [], ctx);

    const player = await this.playerService.findByIdRaw(playerId);
    const bp = await this.backpackService.getByPlayer(playerId);
    return {
      money: player?.money ?? 0,
      items: this.backpackService.parseItems(bp.items),
      battleMobId: ctx.out?.battleMobId,
    };
  }

  /** 同步事件状态：更新最近一条触发记录的对话快照与状态(started→in_progress，ended 收尾) */
  async syncEvent(
    playerId: number,
    eventId: string,
    snapshot: any,
    ended: boolean,
  ): Promise<void> {
    const log = await this.logRepo.findOne({
      where: { player_id: playerId, event_id: eventId },
      order: { id: 'DESC' },
    });
    if (!log) return;
    log.process = JSON.stringify(snapshot || {});
    log.status = ended ? 'ended' : 'in_progress';
    await this.logRepo.save(log);
  }

  /**
   * 获取玩家当前进行中的事件(未 ended)，用于页面刷新后恢复对话。
   * 返回 { event_id, title, nodes, snapshot } 或 null。
   */
  async getCurrent(playerId: number): Promise<{ event_id: string; title: string; nodes: any; snapshot: any } | null> {
    const log = await this.logRepo.findOne({
      where: { player_id: playerId, status: In(['started', 'in_progress']) },
      order: { id: 'DESC' },
    });
    if (!log) return null;
    const ev = await this.repo.findOne({ where: { event_id: log.event_id } });
    let nodes: any = {};
    try { nodes = JSON.parse(ev?.nodes || '{}'); } catch { nodes = {}; }
    let snapshot: any = { messages: [], choices: [], ended: false, path: [] };
    try { snapshot = JSON.parse(log.process || '{}'); } catch { /* keep default */ }
    return { event_id: log.event_id, title: ev?.title || log.event_id, nodes, snapshot };
  }

  /** 启用事件列表（调试/作者用） */
  findAllEnabled() {
    return this.repo.find({ where: { enabled: 1 }, order: { trigger_type: 'ASC', weight: 'DESC' } });
  }

  /**
   * 条件匹配：所有出现的键都满足才算命中（AND）；数组键为"命中其一"(OR)。
   * 未知键忽略，便于前向兼容。
   */
  private matchConditions(cond: any, p: TriggerPayload): boolean {
    if (typeof cond.locType !== 'undefined') {
      if (!cond.locType.includes(p.locType)) return false;
    }
    if (Array.isArray(cond.nameIncludes) && cond.nameIncludes.length) {
      const name = p.name || '';
      if (!cond.nameIncludes.some((kw: string) => name.includes(kw))) return false;
    }
    if (Array.isArray(cond.availableActions) && cond.availableActions.length) {
      const have = p.availableActions || [];
      if (!cond.availableActions.some((a: string) => have.includes(a))) return false;
    }
    if (typeof cond.minLevel !== 'undefined') {
      if ((p.playerLevel ?? 0) < cond.minLevel) return false;
    }
    if (typeof cond.maxLevel !== 'undefined') {
      if ((p.playerLevel ?? 0) > cond.maxLevel) return false;
    }
    if (typeof cond.success !== 'undefined') {
      if (!!p.success !== !!cond.success) return false;
    }
    if (typeof cond.minStar !== 'undefined') {
      if ((p.star ?? 0) < cond.minStar) return false;
    }
    if (typeof cond.taskKind !== 'undefined') {
      if (p.taskKind !== cond.taskKind) return false;
    }
    if (typeof cond.locationId !== 'undefined') {
      // locationId 支持 number 或 number[]
      const cur = (p as any).locationId;
      const arr = Array.isArray(cond.locationId) ? cond.locationId : [cond.locationId];
      if (!arr.includes(cur)) return false;
    }
    return true;
  }
}
