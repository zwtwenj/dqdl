import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Training } from './training.entity';
import { TrainingLog } from './training-log.entity';
import { PlayerService, PLAYER_STATUS } from '../player/player.service';
import { LocationNetService, NetNodeView } from '../location_net/location-net.service';
import { AgentService } from '../agent/agent.service';
import { MobService } from '../mob/mob.service';
import { ItemService } from '../item/item.service';
import { BackpackService, GrantEntry } from '../backpack/backpack.service';
import { EncounterService } from '../encounter/encounter.service';
import { TechniqueService } from '../technique/technique.service';
import { SkillService } from '../skill/skill.service';
import { TaskService } from '../task/task.service';
import { ScriptSseService } from '../script/script-sse.service';
import { Biz } from '../common/biz.exception';
import { Player } from '../player/player.entity';
import { TRAINING } from '../config/game.config';

/** 单条掉落物定义（mob.drops JSON 解析后的结构） */
interface DropEntry {
  item_id: string;
  name: string;
  rate: number;
  min: number;
  max: number;
  type: string;
}

/** 历练时长（毫秒）。优先读 .env TRAINING_MAX_DURATION，缺省用 game.config 默认值 */
const TRAINING_DURATION_MS = Number(process.env.TRAINING_MAX_DURATION) || TRAINING.durationMs;
/** 日志生成间隔（毫秒）。优先读 .env TRAINING_INTERVAL，缺省用 game.config 默认值 */
const TRAINING_LOG_INTERVAL_MS = Number(process.env.TRAINING_INTERVAL) || TRAINING.logIntervalMs;
/** 野外地点类型集合 */
const WILD_TYPES = ['wild', 'wild2', 'wild3'];
/** 胜率（game.config 集中配置） */
const WIN_RATE = TRAINING.winRate;

/** 解析 JSON 字符串为数组，失败/空返回 [] */
function parseJsonArr(raw: string | null | undefined): any[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * 历练服务：玩家在野外地点发起历练，后端定时器每 10s 生成一条叙事日志。
 * 历练到 end_time 自动结束，或玩家手动停止。
 */
@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);
  /** 进行中的定时器：playerId -> timer */
  private readonly timers = new Map<number, NodeJS.Timeout>();

  constructor(
    @InjectRepository(Training)
    private readonly trainingRepo: Repository<Training>,
    @InjectRepository(TrainingLog)
    private readonly logRepo: Repository<TrainingLog>,
    private readonly playerService: PlayerService,
    private readonly locationNetService: LocationNetService,
    private readonly agentService: AgentService,
    private readonly mobService: MobService,
    private readonly backpackService: BackpackService,
    private readonly itemService: ItemService,
    private readonly encounterService: EncounterService,
    private readonly techniqueService: TechniqueService,
    private readonly skillService: SkillService,
    private readonly taskService: TaskService,
    private readonly sse: ScriptSseService,
  ) {
    // 订阅 SSE 连接事件：重连时结算离线历练，断开时转入离线
    this.sse.onConnect((pid) => {
      this.resumeOnline(pid).catch((e) => this.logger.error(`resumeOnline 失败: ${e}`));
    });
    this.sse.onDisconnect((pid) => {
      this.markOffline(pid).catch((e) => this.logger.error(`markOffline 失败: ${e}`));
    });
  }

  /**
   * 开始历练：
   * 1. 校验玩家空闲
   * 2. 校验当前地点是野外且有魔兽
   * 3. 创建历练实例
   * 4. 设玩家状态为历练中
   * 5. 启动定时器生成日志
   */
  async startTraining(playerId: number): Promise<any> {
    const player = await this.playerService.getEntity(playerId);
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    if (player.status !== PLAYER_STATUS.IDLE) {
      throw Biz.conflict('当前状态忙碌，无法开始历练');
    }

    // 校验地点（location_net 网状地图）
    if (!player.location_id) {
      throw Biz.conflict('玩家当前位置未知');
    }
    const location = await this.locationNetService.getNode(player.location_id);
    if (!location) {
      throw Biz.notFound(`地点 ${player.location_id} 不存在`);
    }
    if (!WILD_TYPES.includes(location.loc_type)) {
      throw Biz.conflict('请前往野外地图进行历练');
    }
    const mobs = this.parseCommonMobs(location);
    if (mobs.length === 0) {
      throw Biz.conflict('此地无魔兽可历练');
    }

    // 创建历练实例
    const now = new Date();
    const training = await this.trainingRepo.save(
      this.trainingRepo.create({
        player_id: playerId,
        location_id: location.id,
        status: 0,
        online: 0,
        offline_at: null,
        start_time: now,
        end_time: new Date(now.getTime() + TRAINING_DURATION_MS),
      }),
    );

    // 设玩家状态
    await this.playerService.setStatus(playerId, PLAYER_STATUS.TRAINING);

    // 启动定时器（传玩家功法/斗技供叙事用）
    this.startTimer(playerId, training.id, mobs, location, player);

    this.logger.log(`✅ 玩家 ${playerId} 开始历练 #${training.id} @ ${location.name}`);
    return this.getActiveTraining(playerId);
  }

  /** 停止历练：置实例结束 + 清定时器 + 恢复玩家状态 */
  async stopTraining(playerId: number): Promise<any> {
    const training = await this.trainingRepo.findOneBy({
      player_id: playerId,
      status: 0,
    });
    if (!training) {
      throw Biz.conflict('没有进行中的历练');
    }
    await this.finishTraining(playerId, training.id);
    this.logger.log(`🛑 玩家 ${playerId} 停止历练 #${training.id}`);
    return { ok: true };
  }

  /** 查询当前进行中的历练 + 日志 */
  async getActiveTraining(playerId: number): Promise<any> {
    const training = await this.trainingRepo.findOneBy({
      player_id: playerId,
      status: 0,
    });
    if (!training) return null;
    const logs = await this.logRepo.find({
      where: { training_id: training.id },
      order: { id: 'DESC' },
    });
    return { ...training, logs };
  }

  /** 查询某次历练的日志 */
  async getTrainingLogs(trainingId: number): Promise<TrainingLog[]> {
    return this.logRepo.find({
      where: { training_id: trainingId },
      order: { id: 'ASC' },
    });
  }

  /** 增量查询：返回指定历练中 id > afterLogId 的日志（按 id 升序）。
   *  前端轮询用：初始化拉全量，之后只拉增量，避免重复传输已有日志。 */
  async getTrainingLogsAfter(trainingId: number, afterLogId: number): Promise<TrainingLog[]> {
    return this.logRepo
      .createQueryBuilder('log')
      .where('log.training_id = :trainingId', { trainingId })
      .andWhere('log.id > :afterLogId', { afterLogId })
      .orderBy('log.id', 'ASC')
      .getMany();
  }

  /** 启动定时器：每 10s 生成一条日志 */
  private startTimer(
    playerId: number,
    trainingId: number,
    mobs: { mob_id: string; name: string }[],
    location: NetNodeView,
    player: Player,
  ) {
    const timer = setInterval(async () => {
      try {
        await this.generateLog(playerId, trainingId, mobs, location, player);
      } catch (e) {
        this.logger.error(`历练日志生成异常 #${trainingId}: ${e}`);
      }
    }, TRAINING_LOG_INTERVAL_MS);
    this.timers.set(playerId, timer);
  }

  /** 生成一条历练日志 */
  private async generateLog(
    playerId: number,
    trainingId: number,
    mobs: { mob_id: string; name: string }[],
    location: NetNodeView,
    player: Player,
  ) {
    // 检查历练是否该结束
    const training = await this.trainingRepo.findOneBy({ id: trainingId });
    if (!training || training.status === 1) {
      this.finishTraining(playerId, trainingId);
      return;
    }
    if (new Date() >= training.end_time) {
      this.finishTraining(playerId, trainingId);
      return;
    }

    // 奇遇判定：10% 概率发现副本入口/洞天福地（不遇怪物，本次 tick 走奇遇分支）
    const encounter = await this.encounterService.tryGenerate(playerId);
    if (encounter) {
      await this.generateEncounterLog(
        playerId,
        trainingId,
        player,
        location,
        encounter,
      );
      return;
    }

    // 随机选魔兽
    const mobEntry = mobs[Math.floor(Math.random() * mobs.length)];
    const won = Math.random() < WIN_RATE ? 1 : 0;

    // 查魔兽详情（给 agent 用）
    const mobDetail = await this.mobService.findByMobId(mobEntry.mob_id);

    // 解析玩家功法/斗技名（按 id 反查，空数组/解析失败则无）
    const techniqueNames = await this.parseTechniqueNames(player.technique);
    // 斗技只随机取 1-2 个传给 agent（避免叙事把所有技能都堆上去）
    const allSkillNames = await this.parseSkillNames(player.skill);
    const skillNames = allSkillNames.length > 2
      ? allSkillNames.sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 2))
      : allSkillNames;

    // 调 agent 生成叙事
    let result: { text: string; keywords: { text: string; type: string }[] } | null = null;
    if (mobDetail) {
      result = await this.agentService.generateTraining(
        {
          name: player.name,
          technique_name: techniqueNames.join('、'),
          equipped_skills: skillNames,
        },
        {
          mob_id: mobDetail.mob_id,
          name: mobDetail.name,
          description: mobDetail.description || '',
        },
        { name: location.name, description: location.description || '' },
        won === 1,
      );
    }
    // fallback
    if (!result) {
      const text = won
        ? `${player.name}在${location.name}遭遇${mobEntry.name}，一番激战后将其击退。`
        : `${player.name}在${location.name}遭遇${mobEntry.name}，见势不妙迅速撤离。`;
      result = {
        text,
        keywords: [
          { text: player.name, type: 'player' },
          { text: location.name, type: 'location' },
          { text: mobEntry.name, type: 'mob' },
        ],
      };
    }

    // 胜利时滚动掉落并发放到背包
    let dropsResult: { item_id: string; name: string; count: number }[] | null = null;
    if (won === 1 && mobDetail) {
      const grants = this.rollDrops({
        drops: mobDetail.drops,
        attribute: mobDetail.attribute,
        power: mobDetail.power,
      });
      if (grants.length > 0) {
        try {
          // 先查 item 表拿真实名称，同时校验 item 是否存在（过滤掉非法 id）
          const items = await this.itemService.findByItemIds(grants.map((g) => g.item_id));
          const nameMap = new Map(items.map((it) => [it.item_id, it.name]));
          const valid = grants.filter((g) => nameMap.has(g.item_id));
          const invalid = grants.filter((g) => !nameMap.has(g.item_id));
          if (invalid.length > 0) {
            this.logger.warn(
              `⚠️ 跳过 ${invalid.length} 个不存在的掉落物: ${invalid.map((g) => g.item_id).join(', ')}`,
            );
          }
          if (valid.length > 0) {
            await this.backpackService.grant(playerId, valid, 'training_drop');
            dropsResult = valid.map((g) => ({
              item_id: g.item_id,
              name: nameMap.get(g.item_id)!,
              count: g.count,
            }));
            this.logger.log(
              `🎒 玩家 ${playerId} 获得掉落: ${dropsResult.map((d) => `${d.name}×${d.count}`).join(', ')}`,
            );
          }
        } catch (e) {
          this.logger.error(`掉落发放失败 #${trainingId}: ${e}`);
        }
      }
    }

    // 胜利击杀 → 推进佣兵任务进度（按 地图+怪物 双条件匹配 pending 任务）
    if (won === 1) {
      try {
        const hit = await this.taskService.checkKillProgress(playerId, location.id, mobEntry.mob_id);
        if (hit) {
          this.logger.log(`⚔️ 玩家 ${playerId} 击杀 ${mobEntry.name}(${mobEntry.mob_id}) @ ${location.name}，推进佣兵任务进度`);
        }
      } catch (e) {
        // 任务进度更新失败不阻断历练（掉落/日志照常）
        this.logger.error(`任务进度更新失败 #${trainingId}: ${e}`);
      }
    }

    // 日志存本次实际获得的掉落物（含 item_id/name/count，供前端展示）
    const savedLog = await this.logRepo.save(
      this.logRepo.create({
        training_id: trainingId,
        content: result.text,
        keywords: JSON.stringify(result.keywords),
        mob_id: mobEntry.mob_id,
        won,
        drops: dropsResult ? JSON.stringify(dropsResult) : null,
      }),
    );
    this.logger.log(`📝 历练 #${trainingId} 生成日志：${mobEntry.name} ${won ? '胜' : '逃'}${dropsResult ? ` (+${dropsResult.length}件掉落)` : ''}`);
    // 推送 training_log SSE 事件，前端收到后增量拉取新日志（替代前端轮询）
    this.sse.push(Number(playerId), 'training_log', { last_log_id: savedLog.id });
  }

  /**
   * 生成一条奇遇发现日志（命中奇遇时调用，本次 tick 不遇怪物）。
   * 调 agent /generate/encounter 生成"发现"叙事；失败用 encounter.description 兜底。
   * 日志 mob_id 填 'encounter' 占位，keywords 标记 type='encounter' 供前端识别弹 Toast。
   */
  private async generateEncounterLog(
    playerId: number,
    trainingId: number,
    player: Player,
    location: NetNodeView,
    encounter: { kind: string; title: string; scene_type: string; star: number | null; description: string },
  ) {
    const techniqueNames = await this.parseTechniqueNames(player.technique);
    const text =
      (await this.agentService.generateEncounter(
        { name: player.name, technique_name: techniqueNames.join('、') },
        { name: location.name, description: location.description || '' },
        encounter,
      )) || encounter.description;

    await this.logRepo.save(
      this.logRepo.create({
        training_id: trainingId,
        content: text,
        keywords: JSON.stringify([
          { text: player.name, type: 'player' },
          { text: location.name, type: 'location' },
          { text: encounter.title, type: 'encounter' },
        ]),
        mob_id: 'encounter',
        won: 1,
        drops: null,
      }),
    );
    this.logger.log(`✨ 历练 #${trainingId} 触发奇遇：${encounter.title}（${encounter.kind}）`);
  }

  /** 结束历练：置 status=1 + 清定时器 + 恢复玩家空闲 */
  private async finishTraining(playerId: number, trainingId: number) {
    const timer = this.timers.get(playerId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(playerId);
    }
    await this.trainingRepo.update({ id: trainingId }, { status: 1, online: 0, offline_at: null });
    await this.playerService.setStatus(playerId, PLAYER_STATUS.IDLE);
    // 推送 training_finished，前端收到后停止增量拉取 + 标记历练结束
    this.sse.push(Number(playerId), 'training_finished', { training_id: trainingId });
  }

  // ============ 离线结算（SSE 断连停 agent，重连汇总补算）============

  /** SSE 断开时调用：进行中的历练标记离线 + 停 setInterval（agent 不再生成日志） */
  async markOffline(playerId: number): Promise<void> {
    const training = await this.trainingRepo.findOneBy({
      player_id: playerId,
      status: 0,
    });
    if (!training) return;
    // 已是离线态不重复处理
    if (Number(training.online) === 1) return;
    // 停定时器
    const timer = this.timers.get(playerId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(playerId);
    }
    training.online = 1;
    training.offline_at = new Date();
    await this.trainingRepo.save(training);
    this.logger.log(`🌙 玩家 ${playerId} SSE 断开，历练 #${training.id} 转入离线`);
  }

  /** SSE 重连时调用：结算断线期间（一条汇总日志，不调 agent）+ 恢复 agent 模式或结束 */
  async resumeOnline(playerId: number): Promise<void> {
    const training = await this.trainingRepo.findOneBy({
      player_id: playerId,
      status: 0,
    });
    if (!training) return;
    // 本来就在线（online=0）→ 无需补算，确保定时器在跑
    if (Number(training.online) === 0) {
      return;
    }
    // 算断线 tick 数（每分钟1次，到 end_time 为止）
    const now = new Date();
    const endTime = new Date(training.end_time);
    const offlineAt = training.offline_at ? new Date(training.offline_at) : endTime;
    const settleUntil = now < endTime ? now : endTime;
    const missedTicks = Math.max(0, Math.floor((settleUntil.getTime() - offlineAt.getTime()) / TRAINING_LOG_INTERVAL_MS));

    // 取地点/怪物/玩家（汇总结算+重启定时器用）
    const location = await this.locationNetService.getNode(training.location_id);
    if (!location) {
      this.logger.warn(`resumeOnline: 地点 ${training.location_id} 不存在，跳过`);
      return;
    }
    const mobs = this.parseCommonMobs(location);
    if (mobs.length === 0) return;
    const player = await this.playerService.getEntity(playerId);
    if (!player) return;

    // 结算断线期间（有 tick 才生成汇总日志）
    if (missedTicks > 0) {
      await this.generateOfflineSummaryLog(playerId, training.id, mobs, location, player, missedTicks);
    }

    // 情况(2)：已到期 → 结束历练
    if (now >= endTime) {
      await this.finishTraining(playerId, training.id);
      return;
    }
    // 情况(1)：未到期 → 恢复在线 + 重启 setInterval（agent 模式）
    training.online = 0;
    training.offline_at = null;
    await this.trainingRepo.save(training);
    this.startTimer(playerId, training.id, mobs, location, player);
    this.logger.log(`☀️ 玩家 ${playerId} SSE 重连，历练 #${training.id} 恢复在线（补算 ${missedTicks} 轮）`);
  }

  /**
   * 离线汇总日志：按 missedTicks 批量结算（随机选怪/胜率/滚动掉落/任务进度），
   * 生成一条汇总文本（不调 agent），存日志并推 SSE。
   */
  private async generateOfflineSummaryLog(
    playerId: number,
    trainingId: number,
    mobs: { mob_id: string; name: string }[],
    location: NetNodeView,
    player: Player,
    missedTicks: number,
  ): Promise<void> {
    // 按怪物名聚合击杀数（用于汇总文本）
    const killByName = new Map<string, number>();
    let killCount = 0;
    let fleeCount = 0;
    // 掉落聚合（item_id → {name, count}）
    const dropsAgg = new Map<string, { item_id: string; name: string; count: number }>();
    // 任务进度聚合（mob_id → 击杀数，批量推进）
    const taskKills = new Map<string, number>();

    // 预加载所有 mob 详情（避免循环内重复查库，missedTicks 可能上百）
    const mobDetailMap = new Map<string, any>();
    for (const m of mobs) {
      if (!mobDetailMap.has(m.mob_id)) {
        const d = await this.mobService.findByMobId(m.mob_id);
        if (d) mobDetailMap.set(m.mob_id, d);
      }
    }

    for (let i = 0; i < missedTicks; i++) {
      const mobEntry = mobs[Math.floor(Math.random() * mobs.length)];
      const won = Math.random() < WIN_RATE ? 1 : 0;
      if (won === 1) {
        killCount++;
        killByName.set(mobEntry.name, (killByName.get(mobEntry.name) || 0) + 1);
        taskKills.set(mobEntry.mob_id, (taskKills.get(mobEntry.mob_id) || 0) + 1);
        // 滚动掉落
        const mobDetail = mobDetailMap.get(mobEntry.mob_id);
        if (mobDetail) {
          const grants = this.rollDrops({
            drops: mobDetail.drops,
            attribute: mobDetail.attribute,
            power: mobDetail.power,
          });
          if (grants.length > 0) {
            const items = await this.itemService.findByItemIds(grants.map((g) => g.item_id));
            const nameMap = new Map(items.map((it) => [it.item_id, it.name]));
            const valid = grants.filter((g) => nameMap.has(g.item_id));
            if (valid.length > 0) {
              try {
                await this.backpackService.grant(playerId, valid, 'training_offline');
                for (const g of valid) {
                  const name = nameMap.get(g.item_id)!;
                  const exist = dropsAgg.get(g.item_id);
                  if (exist) exist.count += g.count;
                  else dropsAgg.set(g.item_id, { item_id: g.item_id, name, count: g.count });
                }
              } catch (e) {
                this.logger.error(`离线掉落发放失败 #${trainingId}: ${e}`);
              }
            }
          }
        }
      } else {
        fleeCount++;
      }
    }

    // 批量推进任务进度（按 mob_id 聚合，减少 checkKillProgress 调用次数）
    for (const [mobId, cnt] of taskKills) {
      for (let k = 0; k < cnt; k++) {
        try {
          await this.taskService.checkKillProgress(playerId, location.id, mobId);
        } catch (e) {
          this.logger.error(`离线任务进度推进失败: ${e}`);
          break; // 单怪推进失败不影响其他
        }
      }
    }

    // 生成汇总文本（不调 agent）
    const killText = Array.from(killByName.entries())
      .map(([name, cnt]) => `${name}×${cnt}`)
      .join('、');
    const dropsList = Array.from(dropsAgg.values());
    const dropsText = dropsList.length
      ? `，获得 ${dropsList.map((d) => `${d.name}×${d.count}`).join('、')}`
      : '';
    const summary = `【离线历练】${player.name}在${location.name}历练${missedTicks}轮，击杀${killCount}只魔兽（${killText || '无'}）${fleeCount ? `，逃脱${fleeCount}次` : ''}${dropsText}。`;

    const savedLog = await this.logRepo.save(
      this.logRepo.create({
        training_id: trainingId,
        content: summary,
        keywords: JSON.stringify([]),
        mob_id: '',
        won: killCount > 0 ? 1 : 0,
        drops: dropsList.length ? JSON.stringify(dropsList) : null,
      }),
    );
    this.logger.log(`📝 历练 #${trainingId} 离线汇总：${missedTicks}轮，击杀${killCount}，逃脱${fleeCount}${dropsList.length ? ` (+${dropsList.reduce((s, d) => s + d.count, 0)}件掉落)` : ''}`);
    // 推送 SSE，前端拉这条汇总日志
    this.sse.push(Number(playerId), 'training_log', { last_log_id: savedLog.id });
  }

  /** 解析 location_net 的 common_mobs（NetNodeView 已是数组，直接返回） */
  private parseCommonMobs(location: NetNodeView): { mob_id: string; name: string }[] {
    if (!location.common_mobs) return [];
    return Array.isArray(location.common_mobs) ? location.common_mobs : [];
  }

  /** 属性中文 → 魔核 item_id 字母前缀 */
  private static readonly ATTR_TO_CORE_PREFIX: Record<string, string> = {
    火: 'h', 冰: 'b', 风: 'f', 土: 't', 雷: 'l', 暗: 'a', 毒: 'd', 水: 's',
  };

  /** 战力编码 power → 魔核阶位 tier（1/2/3） */
  private powerToTier(power: number): number {
    if (power <= 12) return 1;
    if (power <= 28) return 2;
    return 3;
  }

  /**
   * 滚动掉落：遍历魔兽的 drops 列表，按 rate 判定是否掉落，
   * 命中后在 [min,max] 随机数量。返回实际掉落物列表。
   *
   * 特殊处理 mh-{x}{t}-N 占位符：按魔兽 attribute（取第一个属性）
   * 和 power 推导的阶位 tier，随机一个品质(1-3)，拼出真实魔核 item_id。
   * 不存在的 item_id 会被 resolveItemId 过滤掉（不发放）。
   */
  private rollDrops(
    mobDetail: { drops: string | null; attribute: string | null; power: number },
  ): GrantEntry[] {
    if (!mobDetail?.drops) return [];
    let drops: DropEntry[];
    try {
      drops = JSON.parse(mobDetail.drops);
    } catch {
      return [];
    }
    if (!Array.isArray(drops)) return [];
    const result: GrantEntry[] = [];
    for (const d of drops) {
      if (!d.item_id || typeof d.rate !== 'number') continue;
      // 按 rate 概率判定是否掉落
      if (Math.random() > d.rate) continue;
      // 在 [min,max] 范围随机数量（min/max 缺省按 1 处理）
      const lo = Math.max(1, d.min ?? 1);
      const hi = Math.max(lo, d.max ?? 1);
      const count = Math.floor(Math.random() * (hi - lo + 1)) + lo;
      if (count <= 0) continue;
      // 解析 item_id（处理 -N 占位符）
      const resolvedId = this.resolveItemId(d.item_id, mobDetail);
      if (resolvedId) result.push({ item_id: resolvedId, count });
    }
    return result;
  }

  /**
   * 解析掉落物 item_id：
   * - 普通格式（cl-100, mh-h2-1）直接返回
   * - 占位符 mh-{x}{t}-N：按魔兽属性+阶位+随机品质拼真实魔核 id
   * 返回 null 表示无效 id（调用方应跳过）。
   */
  private resolveItemId(
    itemId: string,
    mob: { attribute: string | null; power: number },
  ): string | null {
    // 占位符 mh-{前缀}{阶位}-N
    const ph = itemId.match(/^mh-([a-z])(\d)-N$/);
    if (ph) {
      // 取魔兽第一个属性（双属性如"火/土"取"火"）
      const attr = (mob.attribute || '').split('/')[0].trim();
      const prefix = TrainingService.ATTR_TO_CORE_PREFIX[attr];
      if (!prefix) return null;
      const tier = this.powerToTier(mob.power);
      const quality = Math.floor(Math.random() * 3) + 1; // 1-3 随机品质
      return `mh-${prefix}${tier}-${quality}`;
    }
    return itemId;
  }

  /**
   * 解析 player.technique JSON → 已装备功法名数组。
   * player.technique 存的是 [{id, level, cultivation, equipped}]（只有 id，无 name），
   * 需按 id 反查功法表拿真实名字。仅取 equipped 的功法。
   */
  private async parseTechniqueNames(technique: string | null): Promise<string[]> {
    const arr = parseJsonArr(technique);
    const equipped = arr.filter((t) => t?.equipped && Number(t.id) > 0);
    if (!equipped.length) return [];
    const defs = await this.techniqueService.findByIds(
      equipped.map((t) => Number(t.id)),
    );
    const nameMap = new Map(defs.map((d) => [d.id, d.name]));
    return equipped
      .map((t) => nameMap.get(Number(t.id)))
      .filter((n): n is string => typeof n === 'string' && n.trim() !== '');
  }

  /**
   * 解析 player.skill JSON → 已装备斗技名数组。
   * player.skill 存的是 [{id, level, cultivation, carry}]（carry=1~5 表装备槽位），
   * 按 id 反查斗技表拿真实名字。仅取已装备（carry 有效）的斗技。
   */
  private async parseSkillNames(skill: string | null): Promise<string[]> {
    const arr = parseJsonArr(skill);
    const carried = arr.filter(
      (s) => Number(s?.carry) >= 1 && Number(s?.carry) <= 5 && Number(s.id) > 0,
    );
    if (!carried.length) return [];
    const defs = await this.skillService.findByIds(
      carried.map((s) => Number(s.id)),
    );
    const nameMap = new Map(defs.map((d) => [d.id, d.name]));
    return carried
      .map((s) => nameMap.get(Number(s.id)))
      .filter((n): n is string => typeof n === 'string' && n.trim() !== '');
  }
}
