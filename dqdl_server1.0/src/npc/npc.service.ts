import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaticNpc } from './static-npc.entity';
import { Nature } from './nature.entity';
import { NpcRole } from './npc-role.entity';
import { DialogSession } from './dialog-session.entity';
import { DialogEvent } from './dialog-event.entity';
import { PlayerService } from '../player/player.service';
import { LocationService } from '../location/location.service';
import { AgentService } from '../agent/agent.service';
import { Biz } from '../common/biz.exception';

/** 单次会话最大对话轮次（风险控制：避免上下文无限膨胀导致 token 失控） */
const MAX_DIALOG_ROUNDS = 30;

/**
 * NPC 服务（对外可注入）。
 *
 * 会话化对话流程（双轨会话结构）：
 *   1. 前端打开弹窗 → createSession(playerId, npcId) 建 dialog_session（messages=[]）
 *   2. 每次对话 → talkInSession(sessionId, message)：
 *      - server 从 session.messages 提取 history（记忆由 server 塞入上下文）
 *      - 组装 npc/player/location 上下文 + session_id + call_index 调 agent
 *      - agent 落 agent_dialog_call（精细信息），server 用 JSON_ARRAY_APPEND 追加 messages
 *
 * 职责边界：server 记业务（谁和谁聊了什么），agent 记智能体精细信息（token/messages 快照）。
 * session_id 是跨服务唯一耦合键。
 */
@Injectable()
export class NpcService {
  private readonly logger = new Logger(NpcService.name);

  constructor(
    @InjectRepository(StaticNpc)
    private readonly npcRepo: Repository<StaticNpc>,
    @InjectRepository(Nature)
    private readonly natureRepo: Repository<Nature>,
    @InjectRepository(NpcRole)
    private readonly roleRepo: Repository<NpcRole>,
    @InjectRepository(DialogSession)
    private readonly sessionRepo: Repository<DialogSession>,
    @InjectRepository(DialogEvent)
    private readonly eventRepo: Repository<DialogEvent>,
    private readonly playerService: PlayerService,
    private readonly locationService: LocationService,
    private readonly agent: AgentService,
  ) {}

  /** 查某地点的全部 NPC（附带 nature_name/role_name/hint，供前端渲染） */
  async findByLocation(locationId: number): Promise<any[]> {
    const npcs = await this.npcRepo.find({
      where: { location_id: locationId },
      order: { id: 'ASC' },
    });
    const result: any[] = [];
    for (const npc of npcs) {
      const [nature, role] = await Promise.all([
        this.natureRepo.findOneBy({ id: npc.nature_id }),
        this.roleRepo.findOneBy({ id: npc.role_id }),
      ]);
      result.push({
        ...npc,
        nature_name: nature?.name || '',
        nature_hint: nature?.prompt_hint || '',
        role_name: role?.name || '',
        role_hint: role?.prompt_hint || '',
      });
    }
    return result;
  }

  /** 单 NPC 详情（含 nature/role 文案 + dialog_events 快捷按钮） */
  async findOne(id: number): Promise<any> {
    const npc = await this.npcRepo.findOneBy({ id });
    if (!npc) throw Biz.notFound(`NPC ${id} 不存在`);
    const [nature, role, events] = await Promise.all([
      this.natureRepo.findOneBy({ id: npc.nature_id }),
      this.roleRepo.findOneBy({ id: npc.role_id }),
      // 按 role_id 查快捷事件（同 role 共享），前端渲染快捷按钮
      this.eventRepo.find({
        where: { role_id: npc.role_id },
        order: { sort: 'ASC', id: 'ASC' },
      }),
    ]);
    return {
      ...npc,
      nature_name: nature?.name || '',
      nature_hint: nature?.prompt_hint || '',
      role_name: role?.name || '',
      role_hint: role?.prompt_hint || '',
      dialog_events: events.map((e) => ({
        id: e.id,
        text: e.text,
        event: e.event,
      })),
    };
  }

  /**
   * 创建对话会话（每次打开弹窗调一次）。
   * @returns { sessionId, npc } npc 含详情供前端 header 渲染
   */
  async createSession(playerId: number, npcId: number): Promise<{ sessionId: number; npc: any }> {
    const npc = await this.findOne(npcId);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const title = `${npc.name} · ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const session = this.sessionRepo.create({
      player_id: playerId,
      npc_id: npcId,
      location_id: npc.location_id,
      title,
      messages: [],
      status: 1,
      rounds: 0,
    });
    const saved = await this.sessionRepo.save(session);
    return { sessionId: saved.id, npc };
  }

  /**
   * 在会话内对话（开场白传空 message）。
   * 记忆由 server 从 session.messages 提取塞入上下文，前端不再传 history。
   * @returns { reply, callId }
   */
  async talkInSession(
    sessionId: number,
    message: string,
  ): Promise<{ reply: string; callId: number | null; rounds: number; maxRounds: number }> {
    const session = await this.sessionRepo.findOneBy({ id: sessionId });
    if (!session) throw Biz.notFound(`对话会话 ${sessionId} 不存在`);

    // 轮次上限校验：达到上限拒绝继续对话（前端也会禁用输入，这里是后端兜底）
    if (session.rounds >= MAX_DIALOG_ROUNDS) {
      throw Biz.conflict('当前对话轮数过长，请重新进行会话');
    }

    const npc = await this.findOne(session.npc_id);

    // 玩家信息（name/level）
    let player: any = null;
    try {
      player = await this.playerService.findOne(session.player_id);
    } catch {
      player = null;
    }

    // 地点信息（不存在则降级为空对象，不阻断对话）
    let location: any = null;
    try {
      location = await this.locationService.findOne(npc.location_id);
    } catch {
      location = null;
    }

    // 从 session.messages 提取 history（记忆由 server 塞入上下文）
    const history = this.extractHistory(session.messages);

    const callIndex = session.rounds + 1;

    const result = await this.agent.generateDialog({
      npc: {
        name: npc.name,
        nature_name: npc.nature_name,
        nature_hint: npc.nature_hint,
        role_name: npc.role_name,
        role_hint: npc.role_hint,
      },
      location: {
        name: location?.name || '',
        loc_type: location?.loc_type || '',
        description: location?.description || '',
        tags: location?.tags || [],
      },
      player: {
        name: player?.name || '',
        level: player?.level || 0,
      },
      player_input: message || '',
      history,
      session_id: sessionId,
      call_index: callIndex,
    });

    // server 侧追加对话内容到 messages（JSON_ARRAY_APPEND 原子操作，追加 player + npc 两条）
    const now = new Date().toISOString();
    await this.sessionRepo
      .createQueryBuilder()
      .update(DialogSession)
      .set({
        // 两次 JSON_ARRAY_APPEND 嵌套：先追加 player 条，再追加 npc 条
        messages: () =>
          `JSON_ARRAY_APPEND(JSON_ARRAY_APPEND(messages, '$', CAST(:pMsg AS JSON)), '$', CAST(:nMsg AS JSON))`,
        rounds: () => 'rounds + 1',
      })
      .where('id = :id', { id: sessionId })
      .setParameters({
        pMsg: JSON.stringify({ role: 'player', time: now, message: message || '' }),
        nMsg: JSON.stringify({ role: 'npc', time: now, message: result.reply }),
      })
      .execute();

    // 返回更新后的轮次（callIndex = 原 rounds + 1，即更新后的值）
    return {
      reply: result.reply,
      callId: result.call_id,
      rounds: callIndex,
      maxRounds: MAX_DIALOG_ROUNDS,
    };
  }

  /**
   * 从 session.messages 提取 history 供 agent 多轮记忆。
   * messages 结构：[{ role: 'player'|'npc', time, message }]
   * 转成 agent 需要的 [{ player, npc }] 配对。
   */
  private extractHistory(messages: any): { player: string; npc: string }[] {
    if (!Array.isArray(messages)) return [];
    const history: { player: string; npc: string }[] = [];
    let pendingPlayer = '';
    for (const m of messages) {
      if (m?.role === 'player') {
        pendingPlayer = m.message || '';
      } else if (m?.role === 'npc') {
        history.push({ player: pendingPlayer, npc: m.message || '' });
        pendingPlayer = '';
      }
    }
    return history;
  }
}
