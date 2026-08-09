import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoryEventInstance } from './story-event-instance.entity';
import { StoryEvent } from './story-event.entity';
import { TaskService } from '../task/task.service';
import { ScriptSseService } from '../script/script-sse.service';
import { SseEvents } from '../script/sse-events';
import { Biz } from '../common/biz.exception';

/**
 * 故事事件运行时服务。
 *
 * 约定：同一时间一个玩家只能触发一个事件（取 status=playing 的最早一条）。
 * 玩家进入游戏时前端调 GET /api/story/current：
 *   - 无进行中事件 → { event: null }
 *   - 有 → { event: { instance_id, event_id, story_id, title, current_node,
 *                    node（当前节点完整数据，含 text/choices/action）, node_path, status,
 *                    pending_task_id } }
 *
 * 推进（advance）：
 *   - 点"继续/选择" → 执行连线配置（connect_configs["cur->next"]）
 *     - publish_task → 发布任务，故事停在当前节点（记 pending_task_id/pending_goto），
 *       等任务完成（resumeFromTask）后推进到 pending_goto
 *     - 无配置 → 直接推进到下一节点；到 ending 节点 → status=done
 *   - 故事事件不锁玩家状态（玩家需移动完成任务目标），故结束时不恢复 from_status。
 */
@Injectable()
export class StoryService {
  private readonly logger = new Logger(StoryService.name);

  constructor(
    @InjectRepository(StoryEventInstance)
    private readonly instanceRepo: Repository<StoryEventInstance>,
    @InjectRepository(StoryEvent)
    private readonly eventRepo: Repository<StoryEvent>,
    private readonly taskService: TaskService,
    private readonly sse: ScriptSseService,
  ) {}

  /**
   * 查询玩家当前进行中的事件实例（同一时间最多一个）。
   * 返回事件实例 + 当前节点完整数据；无进行中事件返回 null。
   */
  async getCurrentEvent(playerId: number) {
    // 按 created_at 升序取最早一条 playing（防止异常数据出现多条，取最先触发的）
    const instance = await this.instanceRepo.findOne({
      where: { player_id: playerId, status: 'playing' },
      order: { created_at: 'ASC' },
    });
    if (!instance) return null;

    const event = await this.eventRepo.findOne({ where: { id: instance.event_id } });
    if (!event) {
      this.logger.warn(`事件实例 ${instance.id} 关联的事件 ${instance.event_id} 不存在`);
      return null;
    }

    // 解析节点图，取当前节点数据
    const graph = event.nodes || {};
    const nodeMap = graph.nodes || {};
    const current = instance.current_node ? nodeMap[instance.current_node] : null;

    return {
      instance_id: instance.id,
      event_id: event.id,
      story_id: event.story_id,
      title: event.title,
      current_node: instance.current_node,
      node: current,          // { type, title, text, next/choices, action }；缺失时 null
      node_path: instance.node_path || [],
      status: instance.status,
      pending_task_id: instance.pending_task_id, // 非空=故事等待任务完成（停在当前节点）
    };
  }

  /**
   * 推进：点"继续/选择"后调用。
   * - 当前节点是 choice → 需传 goto（选中的分支）
   * - 连线配置为 publish_task → 发布任务，故事停在当前节点，返回 { result: 'task_issued' }
   * - 无连线配置 → 推进到下一节点；到 ending → done
   *
   * @returns { result, task_id?, edge?, current_node?, node?, status?, done?, message? }
   */
  async advance(instanceId: number, playerId: number, goto?: string) {
    const instance = await this.instanceRepo.findOne({
      where: { id: instanceId, player_id: playerId },
    });
    if (!instance) throw Biz.notFound('事件实例不存在');
    if (instance.status !== 'playing') throw Biz.conflict('事件不在进行中');
    if (instance.pending_task_id) {
      return { result: 'task_pending', task_id: instance.pending_task_id, message: '任务进行中，请先完成任务' };
    }

    const event = await this.eventRepo.findOne({ where: { id: instance.event_id } });
    if (!event) throw Biz.notFound('事件不存在');

    const nodeMap = (event.nodes || {}).nodes || {};
    const cur = instance.current_node ? nodeMap[instance.current_node] : null;
    if (!cur) throw Biz.conflict('当前节点不存在');

    // 确定下一节点
    let next: string | null = null;
    if (cur.type === 'choice') {
      const choice = (cur.choices || []).find((c) => c.goto === goto);
      next = choice?.goto ?? null;
    } else {
      next = cur.next || null;
    }
    if (!next) throw Biz.conflict(cur.type === 'choice' ? '无效的选择分支' : '当前节点没有后续推进');

    // 执行连线配置（connect_configs["cur->next"]）
    const edgeKey = `${instance.current_node}->${next}`;
    const edgeCfg = (event.connect_configs || {})[edgeKey];
    if (edgeCfg?.event === 'publish_task') {
      // 发布任务：故事停在当前节点，等任务完成再推进（resumeFromTask）
      const { taskId } = await this.taskService.issueStoryTask(playerId, edgeCfg.task || {});
      instance.pending_task_id = taskId;
      instance.pending_goto = next;
      await this.instanceRepo.save(instance);
      return { result: 'task_issued', task_id: taskId, edge: edgeKey, message: '任务已发布' };
    }

    // 无连线配置：直接推进
    return this.moveToNode(instance, event, next);
  }

  /**
   * 任务完成 → 推进故事（把当前节点推进到 pending_goto）。
   * 由任务模块完成检测后经事件总线调用；推进后推 SSE，前端重开弹窗。
   */
  async resumeFromTask(playerId: number, taskId: number) {
    const instance = await this.instanceRepo.findOne({
      where: { player_id: playerId, pending_task_id: taskId },
    });
    if (!instance) return null;
    const event = await this.eventRepo.findOne({ where: { id: instance.event_id } });
    if (!event) return null;

    const next = instance.pending_goto;
    if (!next) return null;

    const result = await this.moveToNode(instance, event, next);
    // 通知前端重开弹窗（story_event SSE → 前端拉 /current）
    this.sse.push(playerId, SseEvents.STORY_EVENT, {
      instance_id: instance.id,
      event_id: event.id,
      title: event.title,
      current_node: next,
      done: !!result.done,
    });
    return result;
  }

  /** 推进到指定节点：更新 current_node/node_path，到 ending 则置 done */
  private async moveToNode(instance: StoryEventInstance, event: StoryEvent, next: string) {
    const path = instance.node_path || [];
    if (!path.includes(next)) path.push(next);
    instance.current_node = next;
    instance.pending_task_id = null;
    instance.pending_goto = null;
    instance.node_path = path;

    const nodeMap = (event.nodes || {}).nodes || {};
    const nextNode = nodeMap[next] || null;
    const isEnding = nextNode?.type === 'ending';
    if (isEnding) instance.status = 'done';

    await this.instanceRepo.save(instance);
    this.logger.log(`事件实例 ${instance.id} 推进 ${instance.current_node} -> ${next}（${isEnding ? '结局，done' : '进行中'}）`);
    return {
      current_node: next,
      node: nextNode,
      status: instance.status,
      done: isEnding,
    };
  }
}
