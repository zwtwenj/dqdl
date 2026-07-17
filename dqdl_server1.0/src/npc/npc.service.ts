import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { StaticNpc } from './static-npc.entity';
import { Nature } from './nature.entity';
import { NpcRole } from './npc-role.entity';
import { DialogSession } from './dialog-session.entity';
import { DialogEvent } from './dialog-event.entity';
import { DynamicNpcService } from './dynamic-npc.service';
import { PlayerService } from '../player/player.service';
import { LocationService } from '../location/location.service';
import { AgentService } from '../agent/agent.service';
import { Biz } from '../common/biz.exception';
import { evalVisibleRule } from './dialog-visible-rules';

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
    private readonly dynamicNpcService: DynamicNpcService,
    private readonly dataSource: DataSource,
  ) {}

  /** 查某地点的 NPC（"此地之人"），一次返回静态 + 动态两组，附带 nature_name/role_name/hint 供前端渲染。
   *  type='node'  → locationId 视为 location_net 节点 id
   *  type='scene' → locationId 视为 location_scene 场景 id
   *  显式区分节点/场景，不再靠探测表猜（节点28和场景28会撞号）。
   *
   *  返回 { static: [], dynamic: [] }：
   *   - static：绑该地点的静态 NPC（原 findByLocation 逻辑，改名归组）
   *   - dynamic：启用且存活的动态演员，且位置匹配该地点 或 游荡（两列皆空）者
   *  前端无需再发第二次请求取动态演员。
   */
  async findByLocation(
    locationId: number,
    type: 'node' | 'scene' = 'node',
  ): Promise<{ static: any[]; dynamic: any[] }> {
    const [staticNpcs, dynamicNpcs] = await Promise.all([
      this.findStaticByLocation(locationId, type),
      this.dynamicNpcService.findByLocation(locationId, type),
    ]);
    return { static: staticNpcs, dynamic: dynamicNpcs };
  }

  /** 原静态 NPC 查询逻辑（findByLocation 拆分后保留，供合并返回用）。 */
  private async findStaticByLocation(locationId: number, type: 'node' | 'scene' = 'node'): Promise<any[]> {
    const npcs = await this.npcRepo.find({
      where: type === 'scene' ? { location_scene_id: locationId } : { location_id: locationId },
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

  /** 单 NPC 详情（含 nature/role 文案 + dialog_events 快捷按钮）。
   *  playerId 可选：传入时按 dialog_event.visible_rule 过滤事件按钮
   *  （如「交付任务」仅在玩家有可交付任务时返回）；不传则不过滤（兼容旧调用）。
   *  npcType：'static'（默认，查 static_npc）/ 'dynamic'（查 dynamic_npc）。
   *  两表 id 独立自增会撞号，必须用 npcType 区分。 */
  async findOne(id: number, playerId?: number, npcType: 'static' | 'dynamic' = 'static'): Promise<any> {
    const base =
      npcType === 'dynamic'
        ? await this.dynamicNpcService.findRawOne(id)
        : await this.npcRepo.findOneBy({ id });
    if (!base) throw Biz.notFound(`NPC ${id} 不存在`);
    return this.buildNpcDetail(base, playerId, npcType);
  }

  /**
   * 把 static_npc / dynamic_npc 的基础记录拼成统一的详情视图。
   * 两种 NPC 的 nature_id/role_id 语义一致，复用同一套 nature/role/event 查询逻辑。
   * 统一返回结构含：nature_name/nature_hint/role_name/role_hint/role_id/dialog_events/npc_type
   * 以及 location 相关字段（static 用 location_id；dynamic 用 location_net_id）。
   */
  private async buildNpcDetail(
    base: any,
    playerId: number | undefined,
    npcType: 'static' | 'dynamic',
  ): Promise<any> {
    const [nature, role, events] = await Promise.all([
      this.natureRepo.findOneBy({ id: base.nature_id }),
      this.roleRepo.findOneBy({ id: base.role_id }),
      // 按 role_id 查快捷事件（同 role 共享），前端渲染快捷按钮
      this.eventRepo.find({
        where: { role_id: base.role_id },
        order: { sort: 'ASC', id: 'ASC' },
      }),
    ]);

    // 按 visible_rule 过滤事件：有 playerId 才判定（无 playerId 降级为全部返回）
    const ctx = playerId != null ? { playerId, dataSource: this.dataSource } : null;
    const visibleEvents: DialogEvent[] = [];
    for (const e of events) {
      if (!e.visible_rule || !ctx) {
        visibleEvents.push(e);
        continue;
      }
      if (await evalVisibleRule(e.visible_rule, ctx)) {
        visibleEvents.push(e);
      }
    }

    return {
      ...base,
      // 统一字段：节点 id（static 用 location_id；dynamic 用 location_net_id）
      // 这里不抹平列名，保留原样，调用方按 npc_type 取对应列。
      nature_name: nature?.name || '',
      nature_hint: nature?.prompt_hint || '',
      role_name: role?.name || '',
      role_hint: role?.prompt_hint || '',
      role_id: role?.id ?? null,
      npc_type: npcType,
      dialog_events: visibleEvents.map((e) => ({
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
  async createSession(
    playerId: number,
    npcId: number,
    npcType: 'static' | 'dynamic' = 'static',
  ): Promise<{ sessionId: number; npc: any }> {
    const npc = await this.findOne(npcId, playerId, npcType);
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const title = `${npc.name} · ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const session = this.sessionRepo.create({
      player_id: playerId,
      npc_id: npcId,
      npc_type: npcType,
      // 记 NPC 所在地（节点或场景的 id，互斥只有一个有值）；
      // static 用 location_id，dynamic 用 location_net_id；dialog_session.location_id 仅作快照。
      location_id: this.pickNpcLocationId(npc),
      title,
      messages: [],
      status: 1,
      rounds: 0,
    });
    const saved = await this.sessionRepo.save(session);
    return { sessionId: saved.id, npc };
  }

  /** 从 npc 详情里取它的「所在地 id」作快照（节点或场景其一，互斥）。
   *  static_npc 用 location_id / location_scene_id；dynamic_npc 用 location_net_id / location_scene_id。 */
  private pickNpcLocationId(npc: any): number | null {
    if (npc.npc_type === 'dynamic') {
      return npc.location_net_id ?? npc.location_scene_id ?? null;
    }
    return npc.location_id ?? npc.location_scene_id ?? null;
  }

  /**
   * 解析 NPC 所在地信息（供对话上下文用）。
   *   绑场景（location_scene_id）→ 查 location_scene 场景
   *   绑节点 → static 用 location_id / dynamic 用 location_net_id，查 location_net 节点
   *   都没有（动态游荡演员）→ 返回 null（不阻断对话）
   * 返回统一结构 { name, loc_type, description, tags }。
   */
  private async resolveNpcLocation(npc: any): Promise<any> {
    try {
      if (npc.location_scene_id != null) {
        const scene = await this.dataSource
          .getRepository('location_scene')
          .findOneBy({ id: npc.location_scene_id });
        if (scene) {
          return {
            name: scene.name,
            loc_type: scene.scene_type,
            description: scene.description || '',
            tags: scene.available_actions || [],
          };
        }
      }
      // 节点绑定：static 读 location_id，dynamic 读 location_net_id
      const netId = npc.npc_type === 'dynamic' ? npc.location_net_id : npc.location_id;
      if (netId != null) {
        return await this.locationService.findOne(netId);
      }
    } catch {
      // 降级
    }
    return null;
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

    // 按 session.npc_type 分发到 static/dynamic 的 findOne（向后兼容：undefined 降级 static）
    const npcType: 'static' | 'dynamic' =
      session.npc_type === 'dynamic' ? 'dynamic' : 'static';
    const npc = await this.findOne(session.npc_id, undefined, npcType);

    // 玩家信息（name/level）
    let player: any = null;
    try {
      player = await this.playerService.findOne(session.player_id);
    } catch {
      player = null;
    }

    // 地点信息：NPC 绑节点则取节点，绑场景则取场景（不存在则降级空对象）
    const location = await this.resolveNpcLocation(npc);

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
      role_id: npc.role_id ?? undefined,
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
   * 保证某场景拥有"必生职能"的 NPC。
   * 按 npc_role.required_in_loc_type 匹配场景类型（可配置）：
   *   guild   → 公会接待员
   *   market  → 坊市管理员
   *   alchemy → 炼药师
   *   ...
   * 对每个该场景类型要求的职能：若该场景（location_scene_id=scene.id）下还没有这个职能的 NPC，
   * 就调 agent 起一个名字/性格补上。已存在则跳过（幂等）。
   *
   * @param sceneId    location_scene.id（NPC 的 location_scene_id 指向它）
   * @param sceneType  场景类型（guild/market/alchemy/...）
   * @param sceneName  场景名（喂 agent 增加贴合度）
   * @param cityName   所属城市名（可选，喂 agent）
   * @returns 新建 NPC 的 id 列表
   */
  async ensureSceneNpcs(
    sceneId: number,
    sceneType: string,
    sceneName: string,
    cityName?: string,
  ): Promise<number[]> {
    // 1. 找出要求出现在该场景类型的所有职能（读 required_in_loc_type）
    const allRoles = await this.roleRepo.find();
    const matched = allRoles.filter((r) => {
      const types = Array.isArray(r.required_in_loc_type) ? r.required_in_loc_type : [];
      return types.includes(sceneType);
    });
    if (matched.length === 0) return [];

    // 预载该场景已有 NPC 的 role_id，避免每个职能都查一次
    const existing = await this.npcRepo.find({ where: { location_scene_id: sceneId } });
    const existingRoleIds = new Set(existing.map((n) => n.role_id));

    const createdIds: number[] = [];
    for (const role of matched) {
      if (existingRoleIds.has(role.id)) continue; // 该职能已有 NPC，跳过

      const npc = await this.spawnNpcForScene(role, sceneId, sceneName, cityName);
      if (npc) {
        createdIds.push(npc.id);
        existingRoleIds.add(role.id); // 同批防重复
        this.logger.log(`场景 ${sceneName}(${sceneType}) 补 NPC：${npc.name}（${role.name}）`);
      }
    }
    return createdIds;
  }

  /**
   * 为某职能在某场景生成并入库一个 NPC。
   * 姓名/性别/年龄/性格调 agent 生成；agent 不可用或返回不全时随机兜底。
   */
  private async spawnNpcForScene(
    role: NpcRole,
    sceneId: number,
    sceneName: string,
    cityName?: string,
  ): Promise<StaticNpc | null> {
    let name = '';
    let gender = '';
    let age = '';
    let natureName = '';

    const agentResult = await this.agent.generateNpc({
      scene_name: sceneName,
      scene_type: '', // 场景类型在 ensureSceneNpcs 里已用于匹配职能，这里传空省 token
      role_name: role.name,
      role_hint: role.prompt_hint,
      city_name: cityName,
    });
    if (agentResult) {
      name = agentResult.name || '';
      gender = agentResult.gender || '';
      age = agentResult.age || '';
      natureName = agentResult.nature || '';
    }

    // 兜底：agent 没给全的字段，随机补齐
    if (!name) name = this.randomName(gender === '女');
    if (!gender) gender = Math.random() < 0.5 ? '男' : '女';
    if (!age) age = this.AGE_POOL[Math.floor(Math.random() * this.AGE_POOL.length)];

    // 性格必须对齐 nature 表：name 找不到则随机取一个
    let nature = natureName ? await this.natureRepo.findOneBy({ name: natureName }) : null;
    if (!nature) {
      const all = await this.natureRepo.find();
      nature = all[Math.floor(Math.random() * all.length)] || null;
    }

    return this.npcRepo.save(
      this.npcRepo.create({
        name,
        gender,
        age,
        nature_id: nature?.id ?? 1,
        role_id: role.id,
        location_scene_id: sceneId, // 场景绑定写 location_scene_id
        location_id: null,
        greeting: null,
      }),
    );
  }

  /** 随机中文姓名（agent 不可用时兜底） */
  private readonly SURNAME_POOL = ['林', '苏', '萧', '古', '叶', '韩', '云', '墨', '白', '柳', '秦', '沈', '顾', '陆'];
  private readonly MALE_NAME_POOL = ['寒', '风', '霆', '渊', '烈', '铮', '川', '岳', '烽', '戈'];
  private readonly FEMALE_NAME_POOL = ['霜', '月', '婉', '绾', '璃', '芷', '瑶', '苒', '薇', '莺'];
  private readonly AGE_POOL = ['少年', '青年', '中年', '老年'];
  private randomName(female: boolean): string {
    const s = this.SURNAME_POOL[Math.floor(Math.random() * this.SURNAME_POOL.length)];
    const pool = female ? this.FEMALE_NAME_POOL : this.MALE_NAME_POOL;
    const g = pool[Math.floor(Math.random() * pool.length)];
    return s + g;
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
