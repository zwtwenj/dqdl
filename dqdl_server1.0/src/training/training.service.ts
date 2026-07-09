import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Training } from './training.entity';
import { TrainingLog } from './training-log.entity';
import { PlayerService, PLAYER_STATUS } from '../player/player.service';
import { LocationService } from '../location/location.service';
import { AgentService } from '../agent/agent.service';
import { MobService } from '../mob/mob.service';
import { ItemService } from '../item/item.service';
import { BackpackService, GrantEntry } from '../backpack/backpack.service';
import { Biz } from '../common/biz.exception';
import type { Location } from '../location/location.entity';
import { Player } from '../player/player.entity';

/** 单条掉落物定义（mob.drops JSON 解析后的结构） */
interface DropEntry {
  item_id: string;
  name: string;
  rate: number;
  min: number;
  max: number;
  type: string;
}

/** 历练时长（毫秒），暂定 1 分钟 */
const TRAINING_DURATION_MS = 60_000;
/** 日志生成间隔（毫秒），测试用 10 秒 */
const TRAINING_LOG_INTERVAL_MS = 10_000;
/** 野外地点类型集合 */
const WILD_TYPES = ['wild', 'wild2', 'wild3'];
/** 胜率 */
const WIN_RATE = 0.7;

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
    private readonly locationService: LocationService,
    private readonly agentService: AgentService,
    private readonly mobService: MobService,
    private readonly backpackService: BackpackService,
    private readonly itemService: ItemService,
  ) {}

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

    // 校验地点
    if (!player.location_id) {
      throw Biz.conflict('玩家当前位置未知');
    }
    const location = await this.locationService.findOne(player.location_id);
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

  /** 启动定时器：每 10s 生成一条日志 */
  private startTimer(
    playerId: number,
    trainingId: number,
    mobs: { mob_id: string; name: string }[],
    location: Location,
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
    location: Location,
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

    // 随机选魔兽
    const mobEntry = mobs[Math.floor(Math.random() * mobs.length)];
    const won = Math.random() < WIN_RATE ? 1 : 0;

    // 查魔兽详情（给 agent 用）
    const mobDetail = await this.mobService.findByMobId(mobEntry.mob_id);

    // 解析玩家功法/斗技名（空数组/解析失败则无）
    const techniqueNames = this.parseTechniqueNames(player.technique);
    const skillNames = this.parseSkillNames(player.skill);

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
            await this.backpackService.grant(playerId, valid);
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

    // 日志存本次实际获得的掉落物（含 item_id/name/count，供前端展示）
    await this.logRepo.save(
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
  }

  /** 结束历练：置 status=1 + 清定时器 + 恢复玩家空闲 */
  private async finishTraining(playerId: number, trainingId: number) {
    const timer = this.timers.get(playerId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(playerId);
    }
    await this.trainingRepo.update({ id: trainingId }, { status: 1 });
    await this.playerService.setStatus(playerId, PLAYER_STATUS.IDLE);
  }

  /** 解析 location.common_mobs JSON 字符串 */
  private parseCommonMobs(location: Location): { mob_id: string; name: string }[] {
    if (!location.common_mobs) return [];
    try {
      const arr = JSON.parse(location.common_mobs);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
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

  /** 解析 player.technique JSON → 功法名数组（字段名兼容 name/skill_name） */
  private parseTechniqueNames(technique: string | null): string[] {
    if (!technique) return [];
    try {
      const arr = JSON.parse(technique);
      if (!Array.isArray(arr)) return [];
      return arr
        .map((t: any) => t?.name || t?.skill_name || null)
        .filter((n: any): n is string => typeof n === 'string' && n.trim() !== '');
    } catch {
      return [];
    }
  }

  /** 解析 player.skill JSON → 斗技名数组（字段名兼容 name/skill_name） */
  private parseSkillNames(skill: string | null): string[] {
    if (!skill) return [];
    try {
      const arr = JSON.parse(skill);
      if (!Array.isArray(arr)) return [];
      return arr
        .map((s: any) => s?.name || s?.skill_name || null)
        .filter((n: any): n is string => typeof n === 'string' && n.trim() !== '');
    } catch {
      return [];
    }
  }
}
