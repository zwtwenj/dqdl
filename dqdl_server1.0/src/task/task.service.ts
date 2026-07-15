import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Task } from './task.entity';
import { LocationNetService } from '../location_net/location-net.service';
import { MobService } from '../mob/mob.service';
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

/** 解析 .env 的奖励基数配置（逗号分隔），失败回退默认 */
function parseRewardBase(env: string | undefined, def: Record<number, number>): Record<number, number> {
  if (!env) return def;
  const parts = env.split(',').map((s) => Number(s.trim()));
  if (parts.length >= 3 && parts.every((n) => !isNaN(n) && n > 0)) {
    return { 1: parts[0], 2: parts[1], 3: parts[2] };
  }
  return def;
}

/** 任务目标项 */
export interface TaskTarget {
  desc: string;
  current: number;
  required: number;
  net_id: number;
  net_name: string;
  mob_id: string;
  mob_name: string;
}

/** 任务奖励项 */
export interface TaskReward {
  type?: string; // 'money' | 'item'
  name?: string; // type=item 时
  count?: number;
  value?: number; // type=money 时
}

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    private readonly locationNet: LocationNetService,
    private readonly mobService: MobService,
    private readonly dataSource: DataSource,
  ) {}

  // ---------- 佣兵任务生成 ----------

  /**
   * 预览一个佣兵公会战斗任务（生成候选，不入库）。
   *
   * 流程：
   *   1. 取玩家当前地图节点 netId
   *   2. 查三格内（切比雪夫距离≤3）的野外地图候选（含 common_mobs）
   *   3. 不足 3 个 → 定向生成连通野外补齐
   *   4. 仍无候选 → 返回"暂时无法发布任务"
   *   5. 随机取 1 图 + 1 怪 + 6-10 只，组装任务（不入库）
   *
   * 返回候选对象（含可入库所需全部字段），由前端展示给玩家
   * 「接受 / 拒绝 / 换一个」选择；确认后才调 acceptAdventurerTask 入库。
   *
   * @returns { ok, task?, msg? }  task 为候选（无 id，未入库）
   */
  async previewAdventurerTask(
    playerId: number,
  ): Promise<{ ok: boolean; task?: any; msg?: string }> {
    // 0. 上限校验
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

    // 6. 组装候选任务（不入库，无 id）
    return { ok: true, task: this.buildAdventurerDraft(wild, mob, killCount) };
  }

  /**
   * 确认接受一个候选任务（入 task 表）。
   * 候选由 previewAdventurerTask 生成、玩家在前端点「接受」后回传。
   * 再次校验上限（防止并发/重复提交），校验候选字段完整性。
   * @param draft 候选任务（含 name/description/target/reward/star）
   * @returns { ok, task?, msg? }
   */
  async acceptAdventurerTask(
    playerId: number,
    draft: any,
  ): Promise<{ ok: boolean; task?: any; msg?: string }> {
    if (!draft || !draft.target || !draft.reward || !draft.name) {
      return { ok: false, msg: '任务数据不完整' };
    }
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
    const task = this.taskRepo.create({
      player_id: playerId,
      name: draft.name,
      description: draft.description,
      target: typeof draft.target === 'string' ? draft.target : JSON.stringify(draft.target),
      reward: typeof draft.reward === 'string' ? draft.reward : JSON.stringify(draft.reward),
      status: 'pending',
      type: 'adventurer',
      star: draft.star || 1,
      delivery: null,
    });
    const saved = await this.taskRepo.save(task);
    this.logger.log(`玩家 ${playerId} 接受佣兵任务：${task.description}`);
    return { ok: true, task: this.toView(saved) };
  }

  /**
   * 由野生地图候选 + 怪 + 击杀数 组装一个候选任务对象（不入库）。
   * 前端用于展示「接受/拒绝/换一个」。
   */
  private buildAdventurerDraft(
    wild: any,
    mob: { mob_id: string; name: string; rank?: string },
    killCount: number,
  ): any {
    const star = wild.danger_level || 1;
    const dangerLabel: Record<number, string> = { 1: '一阶', 2: '二阶', 3: '三阶' };
    const target: TaskTarget[] = [
      {
        desc: `击杀${mob.name}（${dangerLabel[star] || ''}魔兽）`,
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
      name: `猎杀·${mob.name}`,
      description: `前往${wild.name}，击杀${mob.name}${killCount}只`,
      target,
      reward,
      star,
      type: 'adventurer',
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

  // ---------- 击杀进度判定 ----------

  /**
   * 击杀进度判定（地图+怪物双条件）。
   * 玩家在 netId 地图击杀 mobId 怪时调用，匹配上的 pending 任务 current+1。
   * 达标后保持 pending（等玩家回公会交付），不自动改状态。
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
    return hit;
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
      created_at: t.created_at,
    };
  }

  /** [min, max] 闭区间随机整数 */
  private randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
