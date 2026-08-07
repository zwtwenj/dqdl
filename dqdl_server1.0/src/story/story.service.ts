import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoryEventInstance } from './story-event-instance.entity';
import { StoryEvent } from './story-event.entity';

/**
 * 故事事件运行时服务。
 *
 * 约定：同一时间一个玩家只能触发一个事件（取 status=playing 的最早一条）。
 * 玩家进入游戏时前端调 GET /api/story/current：
 *   - 无进行中事件 → { event: null }
 *   - 有 → { event: { instance_id, event_id, story_id, title, current_node,
 *                    node（当前节点完整数据，含 text/choices/action）, node_path, status } }
 *
 * current_node 的节点数据从 story_event.nodes（{start, nodes:{id:{...}}}）解析，
 * 其中 action 是节点/分支上的游戏动作（battle/move/reward），运行时由前端据此触发。
 */
@Injectable()
export class StoryService {
  private readonly logger = new Logger(StoryService.name);

  constructor(
    @InjectRepository(StoryEventInstance)
    private readonly instanceRepo: Repository<StoryEventInstance>,
    @InjectRepository(StoryEvent)
    private readonly eventRepo: Repository<StoryEvent>,
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
    };
  }
}
