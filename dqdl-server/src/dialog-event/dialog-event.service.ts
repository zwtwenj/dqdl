import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DialogEvent } from '../npc/dialog-event.entity';
import { NpcService } from '../npc/npc.service';
import { TaskService } from '../task/task.service';
import { PlayerService } from '../player/player.service';

/** 后端对前端统一的对话事件响应：前端只渲染 npcReply 并按 type 做 UI 反应 */
export interface DialogEventResult {
  /** 事件类型（与 dialog_event.event.type 一致；无类型闲聊为 'talk'） */
  type: string;
  /** NPC 回复台词（由后端决定，前端不再硬编码） */
  npcReply: string;
  /** 业务数据，如任务卡 / 交付结果，按 type 不同而不同 */
  payload?: any;
}

/**
 * 对话事件编排器：把原本散在前端的「快捷对话 → 调哪个接口 / 组什么数据 / NPC 说什么」
 * 收敛到后端。dialog_event.event.type 成为后端 switch 的判别键，
 * 前端退化为「把 npcReply 推进对话 + 按 type 渲染对应 UI」。
 */
@Injectable()
export class DialogEventService {
  constructor(
    @InjectRepository(DialogEvent)
    private readonly eventRepo: Repository<DialogEvent>,
    private readonly npcService: NpcService,
    private readonly taskService: TaskService,
    private readonly playerService: PlayerService,
  ) {}

  async handleEvent(
    npcId: number,
    eventId: number,
    playerId: number,
    history: any[],
  ): Promise<DialogEventResult> {
    const npc = await this.npcService.findOne(npcId);
    if (!npc) throw new NotFoundException('NPC 不存在');

    const evt = await this.eventRepo.findOneBy({ id: eventId });
    // 校验：事件必须属于当前 NPC 的职能，防止前端传任意 eventId
    if (!evt || evt.role_id !== npc.role_id) {
      throw new NotFoundException('对话事件不存在');
    }

    let cfg: any = {};
    try {
      cfg = typeof evt.event === 'string' ? JSON.parse(evt.event) : evt.event || {};
    } catch {
      cfg = {};
    }

    switch (cfg.type) {
      case 'createAdventurerTask':
        return this.handleCreateAdventurerTask(npc);
      case 'completeTask':
        return this.handleCompleteTask(npcId, playerId);
      case 'trade':
        return { type: 'trade', npcReply: '欢迎光临，看看有什么需要的吧。' };
      case 'cultivationRoom':
        return { type: 'cultivationRoom', npcReply: '修炼室已为你准备妥当，请入内修炼。' };
      default:
        // 无类型事件（纯闲聊项）：交给 agent 走普通对话
        return this.handleTalk(npcId, evt.text, history);
    }
  }

  /** 生成佣兵公会任务预览（不入库），附带任务卡供前端展示/接受 */
  private async handleCreateAdventurerTask(npc: any): Promise<DialogEventResult> {
    const preview = await this.taskService.previewBattleTask(npc.location_id);
    const t0 = preview.target?.[0] || {};
    const taskCard = {
      preview: true,
      name: preview.name || '猎杀魔兽',
      description: preview.description,
      target: preview.target,
      reward: preview.reward,
      delivery: preview.delivery || null,
      star: preview.star || 1,
      location_path: t0.location_path || [],
      mob_name: t0.mob_name || '',
      kill_count: t0.kill_count || t0.required || 0,
      required: t0.required || 0,
      current: 0,
    };
    return {
      type: 'createAdventurerTask',
      npcReply: '本公会有以下任务，你是否接受？',
      payload: { taskCard },
    };
  }

  /** 交付已达标的佣兵公会任务、发放奖励，返回结算信息 */
  private async handleCompleteTask(npcId: number, playerId: number): Promise<DialogEventResult> {
    const tasks = await this.taskService.completeReadyTasks(playerId, npcId);
    if (tasks.length === 0) {
      return { type: 'completeTask', npcReply: '目前没有可以交付的已完成任务。' };
    }
    const names = tasks.map((t) => t.description).join('、');
    let totalMoney = 0;
    for (const t of tasks) {
      for (const r of this.taskService.parse<any>(t.reward)) {
        if (r.type === 'money' && r.value) totalMoney += r.value;
      }
    }
    const player = await this.playerService.findByIdRaw(playerId);
    const moneyMsg = totalMoney > 0 ? ` 获得奖励 ${totalMoney} 金币！` : '';
    return {
      type: 'completeTask',
      npcReply: `辛苦了！已为你登记以下 ${tasks.length} 个任务完成：${names}。${moneyMsg}`,
      payload: { count: tasks.length, money: player?.money ?? 0 },
    };
  }

  /** 无类型闲聊：复用 NPC 普通对话（agent 生成） */
  private async handleTalk(npcId: number, text: string, history: any[]): Promise<DialogEventResult> {
    const reply = await this.npcService.talk(npcId, text, history);
    return { type: 'talk', npcReply: reply?.reply || '……' };
  }
}
