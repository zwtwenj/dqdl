import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Task } from './task.entity';
import { Player } from '../player/player.entity';
import { LocationNetService } from '../location_net/location-net.service';
import { MobService } from '../mob/mob.service';
import { AgentService } from '../agent/agent.service';
import { ScriptSseService } from '../script/script-sse.service';
import { SseEvents } from '../script/sse-events';
import { SCRIPT_HOOK_EVENT } from '../script/script.constants';
import { Biz } from '../common/biz.exception';
import { TASK } from '../config/game.config';

/* ===== 佣兵任务数值：优先读 .env（运行时可调、不打包），缺省用 game.config 默认值 =====
 * 改数值只需改 .env → 重启进程生效，无需重新 build。
 * 对应 .env 变量见根目录 .env 文件。 */
/** 单玩家进行中佣兵任务上限 */
const MAX_ADVENTURER_PENDING = Number(process.env.TASK_MAX_PENDING) || TASK.maxPending;
/** 击杀数量区间 */
const KILL_MIN = Number(process.env.TASK_KILL_MIN) || TASK.killMin;
const KILL_MAX = Number(process.env.TASK_KILL_MAX) || TASK.killMax;
/** 三格内候选地图下限（不足则定向生成补齐） */
const MIN_CANDIDATES = Number(process.env.TASK_MIN_CANDIDATES) || TASK.minCandidates;
/** 危险度 → 奖励基数（.env 用逗号分隔：1阶,2阶,3阶，如 3000,6000,10000） */
const DANGER_REWARD_BASE = parseRewardBase(process.env.TASK_REWARD_BASE, TASK.rewardBase);
/** 任务搜图范围（切比雪夫距离 N 格内） */
const TASK_MAX_DIST = Number(process.env.TASK_MAX_DIST) || TASK.maxDist;
/** 草稿超时秒数：preview 生成的 draft 超过此时间未确认 → 惰性标 delete。默认 600（10分钟） */
const DRAFT_TTL = Number(process.env.TASK_DRAFT_TTL) || 600;

/** 解析 .env 的奖励基数配置（逗号分隔），失败回退默认 */
function parseRewardBase(env: string | undefined, def: Record<number, number>): Record<number, number> {
  if (!env) return def;
  const parts = env.split(',').map((s) => Number(s.trim()));
  if (parts.length >= 3 && parts.every((n) => !isNaN(n) && n > 0)) {
    return { 1: parts[0], 2: parts[1], 3: parts[2] };
  }
  return def;
}

/** 任务目标项。type 决定走哪个完成判定函数：
 *  fight=击杀 / findNpc=找人(预留) / go_to_location=前往某地 / go_to_location_defeat_mob=前往某地击杀(预留)。
 *  go_to_location 系列同时存「管理员配置（loc_type/distance，前端回显）」与「server 解析结果（net_id/net_name，完成检测用）」。 */
export interface TaskTarget {
  type: 'fight' | 'findNpc' | 'go_to_location' | 'go_to_location_defeat_mob';
  desc: string;
  current: number;
  required: number;
  net_id: number;
  net_name: string;
  mob_id?: string;
  mob_name?: string;
  // 前往某地：配置
  loc_type?: string;
  distance?: number;
}

/** 任务奖励项 */
export interface TaskReward {
  type?: string; // 'money' | 'item'
  value?: number; // type=money 时：金币数量
  item_id?: string; // type=item 时：item 表全局唯一ID（如 dp-/mh- 前缀）
  item_name?: string; // type=item 时：物品名（保存时后端自动回填）
  count?: number; // type=item 时：数量
  name?: string; // 兼容旧结构（item 名称兜底）
}

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
    private readonly locationNet: LocationNetService,
    private readonly mobService: MobService,
    private readonly agentService: AgentService,
    private readonly sse: ScriptSseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
  ) {}

  /** 推送 task_update 事件，前端收到后重新拉任务列表。
   *  触发点：击杀计数命中 / 接受任务 / 放弃任务。无连接时静默丢弃。 */
  private notifyTaskUpdate(playerId: number): void {
    this.sse.push(Number(playerId), SseEvents.TASK_UPDATE, { player_id: Number(playerId) });
  }

  // ---------- 故事任务（连线发布任务） ----------

  /**
   * 为玩家发布一个故事任务（type='story'，直接 pending，不可放弃）。
   *
   * 目标解析（target 同时存配置与解析结果）：
   *   go_to_location            → findOrCreateLocation（玩家位置 N 格内指定 loc_type，无则生成）→ net_id/net_name
   *   go_to_location_defeat_mob → 同上 + 从目标点 common_mobs 选怪（击杀完成检测下一轮接）
   *
   * @returns { taskId, targets } targets 为落库后的完整 target 数组
   */
  async issueStoryTask(
    playerId: number,
    cfg: { taskTitle?: string; description?: string; target?: any[]; reward?: any[] },
  ): Promise<{ taskId: number; targets: TaskTarget[] }> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    if (!player.location_id) throw Biz.conflict('玩家尚未在地图上，无法发布任务');

    const targets: TaskTarget[] = [];
    for (const t of cfg?.target || []) {
      const locCfg = t?.value?.location;
      if (t?.type === 'go_to_location') {
        const loc = await this.resolveTargetLocation(player.location_id, locCfg);
        if (!loc) throw Biz.conflict('附近没有可用的任务目标地点');
        targets.push({
          type: 'go_to_location',
          desc: `前往 ${loc.net_name}`,
          current: 0,
          required: 1,
          net_id: loc.net_id,
          net_name: loc.net_name,
          loc_type: loc.loc_type,
          distance: loc.distance,
        });
      } else if (t?.type === 'go_to_location_defeat_mob') {
        const loc = await this.resolveTargetLocation(player.location_id, locCfg);
        if (!loc) throw Biz.conflict('附近没有可用的任务目标地点');
        const mobCount = Math.max(1, Number(locCfg?.mob_count) || 1);
        const mob = await this.pickMobFromLocation(loc.net_id);
        targets.push({
          type: 'go_to_location_defeat_mob',
          desc: mob ? `前往 ${loc.net_name} 击败 ${mob.name} × ${mobCount}` : `前往 ${loc.net_name}`,
          current: 0,
          required: mobCount,
          net_id: loc.net_id,
          net_name: loc.net_name,
          mob_id: mob?.id,
          mob_name: mob?.name,
          loc_type: loc.loc_type,
          distance: loc.distance,
        });
      }
      // 其它类型直接透传配置（fight/findNpc 等，保留描述与要求量）
      else if (t?.type) {
        targets.push({
          type: t.type as TaskTarget['type'],
          desc: t.desc || '',
          current: 0,
          required: Math.max(1, Number(t.required) || 1),
          net_id: 0,
          net_name: '',
        });
      }
    }
    if (!targets.length) throw Biz.conflict('任务没有有效目标');

    const task = await this.taskRepo.create({
      player_id: playerId,
      name: cfg?.taskTitle || '故事任务',
      description: cfg?.description || '',
      target: JSON.stringify(targets),
      reward: JSON.stringify(cfg?.reward || []),
      status: 'pending',
      type: 'story',
      star: 1,
      abandonable: 0,
    });
    await this.taskRepo.save(task);
    this.notifyTaskUpdate(playerId);
    this.logger.log(`发布故事任务 ${task.id}（玩家 ${playerId}，目标 ${targets.length} 个）`);
    return { taskId: task.id, targets };
  }

  /** 解析"前往某地"目标地点：玩家位置 N 格内指定 loc_type，无则生成最近空位节点 */
  private async resolveTargetLocation(
    fromNetId: number,
    locCfg: any,
  ): Promise<{ net_id: number; net_name: string; loc_type: string; distance: number } | null> {
    const locType = locCfg?.loc_type || 'wild';
    const distance = Math.max(1, Number(locCfg?.distance) || 3);
    const loc = await this.locationNet.findOrCreateLocation(fromNetId, locType, distance);
    if (!loc) return null;
    return { net_id: loc.net_id, net_name: loc.net_name, loc_type: locType, distance };
  }

  /** 从目标地点 common_mobs 挑一个怪（go_to_location_defeat_mob 用；选不到返回 null） */
  private async pickMobFromLocation(netId: number): Promise<{ id: string; name: string } | null> {
    try {
      const view = await this.locationNet.fillWildMobs(netId, 4);
      const mobs: any[] = Array.isArray(view?.common_mobs) ? view.common_mobs : [];
      if (mobs.length) {
        return { id: String(mobs[0].mob_id ?? mobs[0].id ?? ''), name: mobs[0].name || '' };
      }
    } catch {
      /* 选怪失败不阻塞任务发布 */
    }
    return null;
  }

  /**
   * 事件总线：进入地图到达 → 检测 go_to_location 故事任务完成。
   * 命中（玩家到达任务目标地点）→ 任务直接完成（claimed，无奖励）→ emit story_task_done → 故事推进。
   */
  @OnEvent(SCRIPT_HOOK_EVENT)
  async onStoryHook(payload: any): Promise<void> {
    try {
      const { hook, playerId, context } = payload || {};
      if (hook !== 'enter_map' || !playerId) return;
      const ctxMap: Record<string, any> = {};
      for (const c of context || []) ctxMap[c.type] = c.data;
      const arrivedNetId = ctxMap.location_net?.id;
      if (arrivedNetId) await this.checkGoToLocationDone(Number(playerId), arrivedNetId);
    } catch (e) {
      this.logger.error(`故事任务到达检测异常: ${(e as Error).message}`);
    }
  }

  /** 到达目标地点 → go_to_location 目标置满，任务直接完成并通知故事推进 */
  private async checkGoToLocationDone(playerId: number, arrivedNetId: number): Promise<void> {
    const tasks = await this.taskRepo.find({
      where: { player_id: playerId, status: 'pending', type: 'story' },
    });
    for (const task of tasks) {
      let targets: TaskTarget[] = [];
      try {
        targets = JSON.parse(task.target || '[]');
      } catch {
        continue;
      }
      const hit = targets.some(
        (t) => t.type === 'go_to_location' && t.net_id === arrivedNetId && t.current < t.required,
      );
      if (!hit) continue;
      targets = targets.map((t) =>
        t.type === 'go_to_location' && t.net_id === arrivedNetId ? { ...t, current: t.required } : t,
      );
      task.target = JSON.stringify(targets);
      // 所有目标都达标才算任务完成（多目标任务：到达只是其中一个目标的进度）
      const allDone = targets.every((t) => (t.current || 0) >= (t.required || 0));
      if (allDone) {
        task.status = 'claimed'; // 故事任务无奖励，到达即完成
        await this.taskRepo.save(task);
        this.notifyTaskUpdate(playerId);
        this.logger.log(`故事任务 ${task.id} 完成（玩家 ${playerId} 到达 ${arrivedNetId}）`);
        // 通知故事模块推进（事件总线解耦，避免 TaskModule 反向依赖 StoryModule）
        this.eventEmitter.emit(SCRIPT_HOOK_EVENT, {
          hook: 'story_task_done',
          playerId,
          context: [{ type: 'task', data: { task_id: task.id } }],
        });
      } else {
        await this.taskRepo.save(task);
        this.notifyTaskUpdate(playerId);
        this.logger.log(`故事任务 ${task.id} 目标进度更新（玩家 ${playerId} 到达 ${arrivedNetId}）`);
      }
    }
  }

  // ---------- 佣兵任务生成 ----------

  /**
   * 预览一个佣兵公会战斗任务（生成草稿落库，返回 taskId）。
   *
   * 流程：
   *   0. 惰性清理该玩家超时草稿（created_at 超 DRAFT_TTL 的 draft → delete）
   *   1. 上限校验（只数 pending，draft 不占上限）
   *   2. 取玩家当前地图节点 netId
   *   3. 查三格内（切比雪夫距离≤3）的野外地图候选（含 common_mobs）
   *   4. 不足 3 个 → 定向生成连通野外补齐
   *   5. 仍无候选 → 返回"暂时无法发布任务"
   *   6. 随机取 1 图 + 1 怪 + 6-10 只，组装草稿 → 落库 status=draft
   *
   * 落库后只返回 taskId（不返回完整 task 对象，防篡改 + 降耦合），
   * 前端用 taskId 调 findOneTask 拉单条展示「接受 / 拒绝 / 换一个」。
   *
   * @returns { ok, taskId?, msg? }  taskId 为已落库的草稿任务 id
   */
  async previewAdventurerTask(
    playerId: number,
    npcId?: number,
    npcName?: string,
  ): Promise<{ ok: boolean; taskId?: number; msg?: string }> {
    // 0. 惰性清理该玩家超时草稿（避免 draft 堆积）
    await this.cleanExpiredDrafts(playerId);

    // 1. 上限校验（draft 不占上限）
    const pendingCount = await this.taskRepo.count({
      where: { player_id: playerId, type: 'adventurer', status: 'pending' },
    });
    if (pendingCount >= MAX_ADVENTURER_PENDING) {
      return {
        ok: false,
        msg: `佣兵公会任务已达上限（${MAX_ADVENTURER_PENDING}个），请先完成现有任务`,
      };
    }

    // 1. 玩家当前地图节点
    const player = await this.dataSource
      .getRepository('player')
      .findOneBy({ id: playerId });
    if (!player) return { ok: false, msg: '玩家不存在' };
    if (player.location_id == null) {
      return { ok: false, msg: '玩家尚未在任何地图上' };
    }
    const netId = player.location_id;

    // 2. 搜图范围内的野外候选
    let candidates = await this.locationNet.findWildsWithin(netId, TASK_MAX_DIST);

    // 3. 不足下限 → 定向生成连通野外补齐，再重查
    if (candidates.length < MIN_CANDIDATES) {
      const need = MIN_CANDIDATES - candidates.length;
      this.logger.log(`${TASK_MAX_DIST}格内野外仅 ${candidates.length} 个，定向生成 ${need} 个补齐`);
      await this.locationNet.ensureWildsWithin(netId, need, TASK_MAX_DIST);
      candidates = await this.locationNet.findWildsWithin(netId, TASK_MAX_DIST);
    }

    // 4. 过滤可用候选：common_mobs 非空才能派发击杀目标。
    //    对 mobs 为空的野外节点惰性补填（调 agent 按 danger_level 用 RAG 检索真实魔兽，
    //    补好就持久化，后续不再重复），补填失败的才剔除。
    const usable: any[] = [];
    for (const w of candidates) {
      const mobs = this.parseMobs(w.common_mobs);
      if (mobs.length > 0) {
        usable.push(w);
        continue;
      }
      // 空 mobs → 惰性补填（仅野外节点，且已确保是 wild）
      const filled = await this.locationNet.fillWildMobs(w.id);
      if (filled && this.parseMobs(filled.common_mobs).length > 0) {
        usable.push(filled);
      }
    }

    if (usable.length === 0) {
      return {
        ok: false,
        msg: '抱歉，本佣兵公会目前暂时无法发布任务',
      };
    }

    // 5. 随机取 1 图 + 1 怪 + 6-10 只
    const wild = usable[Math.floor(Math.random() * usable.length)];
    const mobs = this.parseMobs(wild.common_mobs);
    const mob = mobs[Math.floor(Math.random() * mobs.length)];
    const killCount = this.randInt(KILL_MIN, KILL_MAX);

    // 6. 组装草稿并落库（status=draft），返回 taskId
    const draft = await this.buildAdventurerDraft(player, wild, mob, killCount, npcName);
    const saved = await this.taskRepo.save(
      this.taskRepo.create({
        player_id: playerId,
        name: draft.name,
        description: draft.description,
        target: JSON.stringify(draft.target),
        reward: JSON.stringify(draft.reward),
        status: 'draft',
        type: 'adventurer',
        star: draft.star || 1,
        delivery: null,
        giver_npc_id: npcId ?? null,
        giver_npc_name: draft.giver_npc_name ?? null,
      }),
    );
    return { ok: true, taskId: saved.id };
  }

  /** 惰性清理玩家超时草稿：created_at 超过 DRAFT_TTL 的 draft → delete */
  private async cleanExpiredDrafts(playerId: number): Promise<void> {
    await this.taskRepo
      .createQueryBuilder()
      .update()
      .set({ status: 'delete' })
      .where('player_id = :pid AND status = :status AND created_at < :deadline', {
        pid: playerId,
        status: 'draft',
        deadline: new Date(Date.now() - DRAFT_TTL * 1000),
      })
      .execute();
  }

  /**
   * 确认接受草稿任务（draft → pending）。
   * 前端点「接受」时调用，传 taskId。后端按 taskId 找到自己的草稿（校验归属 + status=draft），
   * 全程后端持有数据，不信任前端传来的任务内容（防篡改）。
   * 再次校验上限（防并发）。
   * @returns { ok, taskId?, msg? }
   */
  async acceptAdventurerTask(
    playerId: number,
    taskId: number,
  ): Promise<{ ok: boolean; taskId?: number; msg?: string }> {
    // 上限二次校验
    const pendingCount = await this.taskRepo.count({
      where: { player_id: playerId, type: 'adventurer', status: 'pending' },
    });
    if (pendingCount >= MAX_ADVENTURER_PENDING) {
      return {
        ok: false,
        msg: `佣兵公会任务已达上限（${MAX_ADVENTURER_PENDING}个）`,
      };
    }
    const task = await this.taskRepo.findOneBy({ id: taskId, player_id: playerId });
    if (!task) return { ok: false, msg: '任务不存在' };
    if (task.status !== 'draft') {
      return { ok: false, msg: '任务状态异常，无法接受' };
    }
    task.status = 'pending';
    await this.taskRepo.save(task);
    this.logger.log(`玩家 ${playerId} 接受佣兵任务 #${taskId}：${task.description}`);
    this.notifyTaskUpdate(playerId);
    return { ok: true, taskId: task.id };
  }

  /**
   * 拒绝/换一个草稿任务（draft → delete）。
   * 前端点「拒绝」或「换一个」时调用，传 taskId。校验归属 + status=draft。
   * @returns { ok, msg? }
   */
  async rejectTask(
    playerId: number,
    taskId: number,
  ): Promise<{ ok: boolean; msg?: string }> {
    const task = await this.taskRepo.findOneBy({ id: taskId, player_id: playerId });
    if (!task) return { ok: false, msg: '任务不存在' };
    if (task.status !== 'draft') {
      return { ok: false, msg: '任务状态异常，无法拒绝' };
    }
    task.status = 'delete';
    await this.taskRepo.save(task);
    return { ok: true };
  }

  /**
   * 由野生地图候选 + 怪 + 击杀数 组装一个候选任务对象（不入库）。
   * 前端用于展示「接受/拒绝/换一个」。
   *
   * 文案优先走 agent（name/description/target.desc），agent 不可用或失败时回退模板字符串，
   * 保证任务总能生成。target.type 标记目标机制（fight/findNpc），完成判定按它分发。
   * giver 为发布人快照（来自 preview 调用方传入的 npcName，缺省"佣兵公会接待员"）。
   */
  private async buildAdventurerDraft(
    player: any,
    wild: any,
    mob: { mob_id: string; name: string; rank?: string },
    killCount: number,
    giverName?: string,
  ): Promise<any> {
    const star = wild.danger_level || 1;
    const dangerLabel: Record<number, string> = { 1: '一阶', 2: '二阶', 3: '三阶' };

    // 模板兜底文案（地名/怪物名带 HTML 高亮 span，与 agent 输出格式一致，前端 v-html 渲染）
    const fallbackName = `猎杀·${mob.name}`;
    const fallbackDesc = `前往<span style="color: green">${wild.name}</span>，击杀<span style="color: #e77800">${mob.name}</span>${killCount}只（完成后回佣兵公会与接待员交谈交付）`;
    const fallbackTargetDesc = `击杀<span style="color: #e77800">${mob.name}</span>（${dangerLabel[star] || ''}魔兽）`;

    // 调 agent 生成文案（失败回退模板）
    let name = fallbackName;
    let description = fallbackDesc;
    let targetDesc = fallbackTargetDesc;
    try {
      const agentText = await this.agentService.generateTaskAdventurer({
        player: { name: player.name, level: player.level },
        wild: { name: wild.name, description: wild.description || '', danger_level: star },
        mob: { mob_id: mob.mob_id, name: mob.name, rank: mob.rank || dangerLabel[star] || '' },
        killCount,
        star,
      });
      if (agentText) {
        if (agentText.name?.trim()) name = agentText.name.trim();
        if (agentText.description?.trim()) description = agentText.description.trim();
        if (agentText.target_desc?.trim()) targetDesc = agentText.target_desc.trim();
      }
    } catch (e) {
      this.logger.warn(`task 文案生成走 fallback：${e}`);
    }

    // description 列是 varchar255。agent 文案含 HTML span 高亮，直接 slice 可能切断标签
    // 导致 v-html 渲染破损，故超长时整体回退到标签完整的模板兜底（而非截断）。
    if (description.length > 255) description = fallbackDesc;

    const target: TaskTarget[] = [
      {
        type: 'fight',
        desc: targetDesc,
        current: 0,
        required: killCount,
        net_id: wild.id,
        net_name: wild.name,
        mob_id: mob.mob_id,
        mob_name: mob.name,
      },
    ];
    const reward: TaskReward[] = [
      { type: 'money', value: DANGER_REWARD_BASE[star] ?? DANGER_REWARD_BASE[1] },
    ];
    return {
      name,
      description,
      target,
      reward,
      star,
      type: 'adventurer',
      giver_npc_id: null,
      giver_npc_name: giverName || '佣兵公会接待员',
    };
  }

  // ---------- 查询 ----------

  /** 查玩家进行中任务（pending），给前端展示 */
  async findMyTasks(playerId: number): Promise<any[]> {
    const tasks = await this.taskRepo.find({
      where: { player_id: playerId, status: 'pending' },
      order: { id: 'DESC' },
    });
    return tasks.map((t) => this.toView(t));
  }

  /** 查单条任务详情（按 id + playerId 校验归属）。任务详情弹窗用 */
  async findOneTask(playerId: number, taskId: number): Promise<any | null> {
    const task = await this.taskRepo.findOneBy({
      id: taskId,
      player_id: playerId,
    });
    return task ? this.toView(task) : null;
  }

  /**
   * 放弃任务（pending/claimed → abandoned）。
   * 玩家主动放弃，状态置 abandoned（已放弃），不退奖励、不退进度。
   * 校验：归属 + abandonable=1 + 状态为 pending 或 claimed。
   * @returns { ok, msg? }
   */
  async abandonTask(
    playerId: number,
    taskId: number,
  ): Promise<{ ok: boolean; msg?: string }> {
    const task = await this.taskRepo.findOneBy({ id: taskId, player_id: playerId });
    if (!task) return { ok: false, msg: '任务不存在' };
    if (Number(task.abandonable) !== 1) {
      return { ok: false, msg: '该任务不可放弃' };
    }
    if (task.status !== 'pending' && task.status !== 'claimed') {
      return { ok: false, msg: '当前状态不可放弃' };
    }
    task.status = 'abandoned';
    await this.taskRepo.save(task);
    this.logger.log(`玩家 ${playerId} 放弃任务 #${taskId}（${task.name}）`);
    this.notifyTaskUpdate(playerId);
    return { ok: true };
  }

  // ---------- 击杀进度判定 ----------

  /**
   * 击杀进度判定（地图+怪物双条件）。
   * 玩家在 netId 地图击杀 mobId 怪时调用，匹配上且目标机制为 fight 的 pending 任务 current+1。
   * 达标后保持 pending（等玩家回公会交付），不自动改状态。
   *
   * 注意两层 type：
   *   - task.type='adventurer'（任务级分类，保留不动）→ where 条件
   *   - target[].type='fight'（目标级机制，新增）→ 内部分发，只推进 fight 目标
   * @returns 是否命中了任意任务目标
   */
  async checkKillProgress(
    playerId: number,
    netId: number,
    mobId: string,
  ): Promise<boolean> {
    const tasks = await this.taskRepo.find({
      where: { player_id: playerId, type: 'adventurer', status: 'pending' },
    });
    let hit = false;
    for (const task of tasks) {
      const targets: TaskTarget[] = this.safeParseArr(task.target);
      let changed = false;
      for (const t of targets) {
        // 只处理 fight 目标（findNpc 不走击杀判定）
        if (t.type !== 'fight') continue;
        // 双条件：地图 + 怪物都匹配，且未达标
        if (t.net_id === netId && t.mob_id === mobId && t.current < t.required) {
          t.current += 1;
          changed = true;
          hit = true;
        }
      }
      if (changed) {
        task.target = JSON.stringify(targets);
        await this.taskRepo.save(task);
      }
    }
    // 命中击杀目标 → 推送 task_update，前端刷新任务列表
    if (hit) this.notifyTaskUpdate(playerId);
    return hit;
  }

  /**
   * 找人任务进度判定（预留，后端暂未接入）。
   * 完成条件待定（到达指定场景 / 与指定 NPC 对话），本轮仅占位。
   * 触发点尚未建立，此方法当前无调用方。
   * @returns 是否命中
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async checkFindNpcProgress(
    playerId: number,
    netId: number,
    npcId?: number,
  ): Promise<boolean> {
    // TODO: findNpc 完成判定 + 触发点接入（到达/对话）
    return false;
  }

  // ---------- 交付领奖 ----------

  /**
   * 交付任务（领奖）。要求该任务所有 target 已达标（current >= required）。
   * 达标 → 发金币奖励（money 类型累加），status 置 claimed。
   * 未达标 → 抛 conflict。
   */
  async claimTask(playerId: number, taskId: number): Promise<{ money: number }> {
    const task = await this.taskRepo.findOneBy({ id: taskId, player_id: playerId });
    if (!task) throw Biz.notFound(`任务 ${taskId} 不存在`);
    if (task.status === 'claimed') throw Biz.conflict('该任务已交付');
    if (task.status !== 'pending') throw Biz.conflict(`任务状态异常：${task.status}`);

    // 校验全部达标
    const targets: TaskTarget[] = this.safeParseArr(task.target);
    const allDone = targets.length > 0 && targets.every((t) => t.current >= t.required);
    if (!allDone) throw Biz.conflict('任务目标尚未全部完成');

    // 发奖（本轮只处理 money；item 奖励后续接背包）
    const rewards: TaskReward[] = this.safeParseArr(task.reward);
    let totalMoney = 0;
    for (const r of rewards) {
      if (r.type === 'money' && r.value) totalMoney += r.value;
    }
    if (totalMoney > 0) {
      await this.dataSource
        .getRepository('player')
        .increment({ id: playerId }, 'money', totalMoney);
    }

    task.status = 'claimed';
    await this.taskRepo.save(task);
    this.logger.log(`玩家 ${playerId} 交付任务 ${taskId}，奖励 ${totalMoney} 金币`);
    return { money: totalMoney };
  }

  // ---------- 工具 ----------

  /** 解析 common_mobs（TEXT 列 JSON 字符串 / 数组兼容） */
  private parseMobs(raw: any): { mob_id: string; name: string; rank?: string }[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  /** 安全 parse JSON TEXT 列为数组 */
  private safeParseArr(raw: string | null): any[] {
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  /** 实体 → 对外视图（parse target/reward/delivery） */
  private toView(t: Task) {
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      target: this.safeParseArr(t.target),
      reward: this.safeParseArr(t.reward),
      delivery: t.delivery ? this.safeParseArr(t.delivery) : null,
      status: t.status,
      type: t.type,
      star: t.star,
      abandonable: Number(t.abandonable) === 1,
      giver_npc_id: t.giver_npc_id ?? null,
      giver_npc_name: t.giver_npc_name ?? null,
      created_at: t.created_at,
    };
  }

  /** [min, max] 闭区间随机整数 */
  private randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
