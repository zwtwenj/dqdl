import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Training } from './training.entity';
import { TrainingLog } from './training-log.entity';
import { PlayerService, PLAYER_STATUS } from '../player/player.service';
import { LocationService } from '../location/location.service';
import { AgentService } from '../agent/agent.service';
import { MobService } from '../mob/mob.service';
import { Biz } from '../common/biz.exception';
import type { Location } from '../location/location.entity';

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

    // 启动定时器
    this.startTimer(playerId, training.id, mobs, location, player.name);

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
    playerName: string,
  ) {
    const timer = setInterval(async () => {
      try {
        await this.generateLog(playerId, trainingId, mobs, location, playerName);
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
    playerName: string,
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

    // 调 agent 生成叙事
    let result: { text: string; keywords: { text: string; type: string }[] } | null = null;
    if (mobDetail) {
      result = await this.agentService.generateTraining(
        { name: playerName, technique_name: '弄焰诀' },
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
        ? `${playerName}在${location.name}遭遇${mobEntry.name}，一番激战后将其击退。`
        : `${playerName}在${location.name}遭遇${mobEntry.name}，见势不妙迅速撤离。`;
      result = {
        text,
        keywords: [
          { text: playerName, type: 'player' },
          { text: location.name, type: 'location' },
          { text: mobEntry.name, type: 'mob' },
        ],
      };
    }

    await this.logRepo.save(
      this.logRepo.create({
        training_id: trainingId,
        content: result.text,
        keywords: JSON.stringify(result.keywords),
        mob_id: mobEntry.mob_id,
        won,
      }),
    );
    this.logger.log(`📝 历练 #${trainingId} 生成日志：${mobEntry.name} ${won ? '胜' : '逃'}`);
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
}
