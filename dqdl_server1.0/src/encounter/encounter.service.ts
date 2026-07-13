import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Encounter } from './encounter.entity';
import { ENCOUNTER } from '../config/game.config';

/**
 * 奇遇服务：历练中概率发现副本入口/洞天福地，入玩家奇遇列表。
 * 复刻老版 dqdl-server/encounter 的核心逻辑（10% 触发、50/50 dungeon/cultivate）。
 * 触发率/上限/分流比例集中配置于 game.config。
 */

const SCENE_TITLES: Record<string, string> = {
  '山洞': '幽冥石洞',
  '密林': '迷雾密林',
  '山谷': '回音山谷',
  '浅滩': '潮汐浅滩',
};

const SCENE_DESCS: Record<string, string[]> = {
  '山洞': [
    '你发现了一个隐蔽的山洞，洞中隐隐传来异样的响动。',
    '一处山洞半掩在藤蔓之后，里头似有微光闪烁，透着几分凶险。',
    '岩壁之后豁然现出一口洞穴，深处偶尔传来低沉的嘶吼。',
  ],
  '密林': [
    '前方密林深处，树影摇曳间似有活物穿行，隐隐透着凶险。',
    '一片诡谲的密林拦住去路，林间薄雾弥漫，鸟兽噤声。',
    '古木参天的密林中，隐约可见一处被人遗忘的所在。',
  ],
  '山谷': [
    '群山环抱间露出一道幽谷，谷底回荡着空灵的回响。',
    '一处僻静山谷出现在眼前，谷中花草异色，似有灵气流转。',
    '断崖之下现出一道深谷，谷口石碑斑驳，刻满风霜。',
  ],
  '浅滩': [
    '溪流尽头是一片隐秘的浅滩，水面下似有物件沉浮。',
    '潮水退去，礁石间露出一段少有人至的浅滩。',
    '芦苇荡后的浅滩上，散落着些许来历不明的物件。',
  ],
};

const SCENE_TYPES = Object.keys(SCENE_TITLES);

const CULTIVATE_DESCS: Record<number, string[]> = {
  1: [
    '你发现了一处斗气氤氲的宝地，在此修炼斗气必能有所精进。',
    '林间空地灵气微微流转，是个静心吐纳的好去处。',
  ],
  2: [
    '你寻得一处斗气浓郁的灵地，盘膝吐纳，事半功倍。',
    '山谷之中灵气汇聚如泉，在此修炼一日，抵得上寻常数日功夫。',
  ],
  3: [
    '眼前竟是一处斗气如雾的洞天福地，灵气逼人，千载难逢。',
    '一处天然灵脉浮现于前，浓郁斗气几乎凝为实质，这般机缘万中无一。',
  ],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

@Injectable()
export class EncounterService {
  constructor(
    @InjectRepository(Encounter)
    private readonly repo: Repository<Encounter>,
  ) {}

  /** 历练中尝试触发奇遇：按配置概率，且 pending 未满。返回生成的奇遇或 null */
  async tryGenerate(playerId: number): Promise<Encounter | null> {
    if (Math.random() > ENCOUNTER.triggerRate) return null;
    return this.generateForced(playerId);
  }

  /**
   * 强制触发一次奇遇（跳过概率掷骰，但仍受 pending 上限约束）。
   * 50% 副本入口(山洞/密林/山谷/浅滩)，50% 洞天福地(1-3星)。
   */
  async generateForced(playerId: number): Promise<Encounter | null> {
    const pendingCount = await this.repo.count({
      where: { player_id: playerId, status: 'pending' },
    });
    if (pendingCount >= ENCOUNTER.maxPending) return null;

    if (Math.random() < ENCOUNTER.dungeonRatio) {
      const sceneType = pick(SCENE_TYPES);
      return this.repo.save(
        this.repo.create({
          player_id: playerId,
          kind: 'dungeon',
          scene_type: sceneType,
          title: SCENE_TITLES[sceneType],
          description: pick(SCENE_DESCS[sceneType]),
          star: null,
          status: 'pending',
        }),
      );
    }
    const star = 1 + Math.floor(Math.random() * 3);
    return this.repo.save(
      this.repo.create({
        player_id: playerId,
        kind: 'cultivate',
        scene_type: '',
        title: `洞天福地·${'一二三'[star - 1]}星`,
        description: pick(CULTIVATE_DESCS[star]),
        star,
        status: 'pending',
      }),
    );
  }

  /** 玩家可见奇遇列表：pending（未进入）+ entered（会话进行中），按时间倒序 */
  findVisible(playerId: number): Promise<Encounter[]> {
    return this.repo.find({
      where: { player_id: playerId, status: In(['pending', 'entered']) },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * 放弃奇遇（pending 未进入 / entered 已进入但未完成 都可放弃）。
   * 返回受影响行数：>0 表示成功放弃，0 表示该奇遇不存在/不属于该玩家/状态已是终态。
   * 调用方（controller）应据此判断是否需要联动复位玩家状态/清理秘境实例。
   */
  async abandon(id: number, playerId: number): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update()
      .set({ status: 'abandoned' })
      .where('id = :id AND player_id = :pid AND status IN (:...statuses)', {
        id,
        pid: playerId,
        statuses: ['pending', 'entered'],
      })
      .execute();
    return result.affected || 0;
  }

  /** 查单个奇遇（controller 判断是否 entered 态用于联动） */
  async findOne(id: number, playerId: number): Promise<Encounter | null> {
    return this.repo.findOneBy({ id, player_id: playerId });
  }

  /**
   * 进入奇遇：校验属主+pending，标记为已进入并返回奇遇数据。
   * 供秘境（dungeon）enter 调用，取其 scene_type 作为秘境场景。
   */
  async consume(id: number, playerId: number): Promise<Encounter | null> {
    const enc = await this.repo.findOne({
      where: { id, player_id: playerId, status: 'pending' },
    });
    if (!enc) return null;
    enc.status = 'entered';
    await this.repo.save(enc);
    return enc;
  }

  /** 秘境/洞天结束时把对应奇遇标记为已完成（从可见列表移除） */
  async markDone(encounterId: number | null, playerId: number): Promise<any> {
    if (!encounterId) return null;
    return this.repo.update(
      { id: encounterId, player_id: playerId },
      { status: 'done' },
    );
  }
}
