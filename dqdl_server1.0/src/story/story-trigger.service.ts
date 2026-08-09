import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoryEvent } from './story-event.entity';
import { StoryEventInstance } from './story-event-instance.entity';
import { StoryService } from './story.service';
import { ScriptSseService } from '../script/script-sse.service';
import { SseEvents } from '../script/sse-events';
import { SCRIPT_HOOK_EVENT } from '../script/script.constants';
import { evaluateTriggerConfig } from './story-trigger.lib';

/**
 * 故事事件触发服务：游戏钩子 → 对应触发函数 → 命中则建实例 + SSE 推前端。
 *
 * 钩子 → 函数映射（函数库）：
 *   enterMap(player, location)   ← 移动到达时（move arrive emit 'enter_map' 钩子 → 本服务分发）
 *   （后续按需加 completeTask / defeatEnemy / useItem）
 *
 * 触发机制（与剧本 script 模块一致的事件总线）：
 *   业务服务 emit SCRIPT_HOOK_EVENT { hook, playerId, context: [{ type, data }] }，
 *   本服务 @OnEvent 接收 → 按 hook 分发到对应函数。
 *
 * 约定：同一时间一个玩家最多一个进行中事件（已有 playing 实例则跳过本次触发）。
 */
@Injectable()
export class StoryTriggerService {
  private readonly logger = new Logger(StoryTriggerService.name);

  constructor(
    @InjectRepository(StoryEvent)
    private readonly eventRepo: Repository<StoryEvent>,
    @InjectRepository(StoryEventInstance)
    private readonly instanceRepo: Repository<StoryEventInstance>,
    private readonly storyService: StoryService,
    private readonly sse: ScriptSseService,
  ) {}

  /** 事件总线分发：SCRIPT_HOOK_EVENT → 函数库。fire-and-forget（异步监听不阻塞主业务）。 */
  @OnEvent(SCRIPT_HOOK_EVENT)
  async onHook(payload: any): Promise<void> {
    try {
      const { hook, playerId, context } = payload || {};
      if (!hook || !playerId) return;
      // context 归一化为 { type: data } 映射
      const ctxMap: Record<string, any> = {};
      for (const c of context || []) ctxMap[c.type] = c.data;

      if (hook === 'enter_map') {
        const player = ctxMap.player;
        const location = ctxMap.location_net;
        if (player && location) await this.enterMap(player, location);
      }
      // 任务完成 → 推进故事（任务模块完成检测后 emit）
      else if (hook === 'story_task_done') {
        const task = ctxMap.task;
        if (task?.task_id) await this.storyService.resumeFromTask(Number(playerId), Number(task.task_id));
      }
      // 后续钩子：complete_task / defeat_enemy / use_item 在此分支
    } catch (e) {
      this.logger.error(`事件触发异常 hook=${payload?.hook}: ${(e as Error).message}`);
    }
  }

  /**
   * 进入地图钩子（函数库）：玩家到达某地图时调用。
   * @param player   玩家信息 { id, level, money, status, ... }
   * @param location 地图信息 { id, name, loc_type }
   */
  async enterMap(
    player: any,
    location: { id: number; name: string; loc_type: string },
  ): Promise<void> {
    await this.tryTrigger(player, 'enter_map', { location });
  }

  /**
   * 通用触发入口：找出 trigger=hook 且带配置的事件，逐条求值，
   * 命中最早一条则创建事件实例（status=playing，从 start 节点开始）并推 SSE。
   * 玩家已有进行中事件时不触发。
   */
  private async tryTrigger(player: any, hook: string, ctx: any): Promise<void> {
    // 已有进行中事件 → 不再触发
    const playing = await this.instanceRepo.findOne({
      where: { player_id: player.id, status: 'playing' },
      order: { created_at: 'ASC' },
    });
    if (playing) return;

    const events = await this.eventRepo.find();
    for (const ev of events) {
      const cfg = ev.trigger_config;
      if (!cfg || cfg.trigger !== hook) continue;
      if (!evaluateTriggerConfig(cfg, player, ctx)) continue;

      const start = ev.nodes?.start ?? null;
      const instance = this.instanceRepo.create({
        event_id: ev.id,
        player_id: player.id,
        current_node: start,
        node_path: start ? [start] : [],
        status: 'playing',
        from_status: player.status,
      });
      await this.instanceRepo.save(instance);
      this.logger.log(`事件 ${ev.id}(${ev.title}) 触发（玩家 ${player.id}，钩子 ${hook}）`);
      this.sse.push(player.id, SseEvents.STORY_EVENT, {
        event_id: ev.id,
        instance_id: instance.id,
        title: ev.title,
        current_node: start,
      });
      return; // 同一时刻只触发一个
    }
  }
}
