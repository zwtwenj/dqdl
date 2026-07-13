import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DungeonInstance } from './dungeon-instance.entity';
import { PlayerService, PLAYER_STATUS } from '../player/player.service';
import { MobService } from '../mob/mob.service';
import { ItemService } from '../item/item.service';
import { AgentService } from '../agent/agent.service';
import { EncounterService } from '../encounter/encounter.service';
import { LocationNetService } from '../location_net/location-net.service';
import { Biz } from '../common/biz.exception';

const SCENE_POOL = ['山洞', '密林', '山谷', '浅滩'];

/** loc_type → 难度（地图等阶）：wild=一阶, wild2=二阶, wild3=三阶，其它默认一阶 */
const LOC_TYPE_TO_TIER: Record<string, number> = {
  wild: 1,
  wild2: 2,
  wild3: 3,
};

/** 难度 → 等阶配置（决定副本内魔兽/魔核的等阶） */
const TIER_CONFIG: Record<number, { mobLvMin: number; mobLvMax: number; coreKeyword: string }> = {
  1: { mobLvMin: 1, mobLvMax: 9, coreKeyword: '一阶' },
  2: { mobLvMin: 11, mobLvMax: 19, coreKeyword: '二阶' },
  3: { mobLvMin: 21, mobLvMax: 29, coreKeyword: '三阶' },
};

export interface DungeonBlueprint {
  title: string;
  scene_type: string;
  intro: string;
  acts: { index: number; type: string; title: string; narrative: string }[];
}

/**
 * 秘境服务：AI 生成五幕蓝图 + 按难度装配（enrich）+ 逐幕推进。
 *
 * 编排：enter 时调 agent /generate/dungeon 生成骨架 → enrichActs 按难度挂魔兽/魔核 → 落库。
 * 难度来源：玩家当前地图 loc_type（wild/wild2/wild3 → 1/2/3 阶）。
 * 进度全落库（acts JSON + current_act），刷新页面用 getCurrent 恢复。
 *
 * 本次第一期：只做编排闭环。战斗/临时背包结算留桩位（temp_items 列已建）。
 */
@Injectable()
export class DungeonService {
  private readonly logger = new Logger(DungeonService.name);

  constructor(
    @InjectRepository(DungeonInstance)
    private readonly repo: Repository<DungeonInstance>,
    private readonly playerService: PlayerService,
    private readonly mobService: MobService,
    private readonly itemService: ItemService,
    private readonly agentService: AgentService,
    private readonly encounterService: EncounterService,
    private readonly locationNetService: LocationNetService,
  ) {}

  /**
   * 进入副本：校验空闲 → 消耗奇遇（若有）→ 推断难度 → 生成蓝图+装配 → 落库。
   * 旧进行中副本自动标记为 escaped（同时只允许一个进行中）。
   */
  async enter(playerId: number, encounterId?: number): Promise<DungeonInstance> {
    // 1. 校验空闲（playerService.assertIdle 是 private，这里内联校验）
    const player = await this.playerService.findOne(playerId);
    if (!player) throw Biz.notFound('玩家不存在');
    if (player.status !== PLAYER_STATUS.IDLE) {
      throw Biz.conflict('当前状态无法进入秘境');
    }

    // 2. 旧进行中副本标记为 escaped
    await this.repo.update(
      { player_id: playerId, status: 'active' },
      { status: 'escaped' },
    );

    // 3. 场景类型：由奇遇进入则消耗奇遇取其 scene_type，否则随机
    let sceneType = SCENE_POOL[Math.floor(Math.random() * SCENE_POOL.length)];
    let encounterRefId: number | null = null;
    if (encounterId) {
      const enc = await this.encounterService.consume(encounterId, playerId);
      if (enc) {
        sceneType = enc.scene_type;
        encounterRefId = enc.id;
      }
    }

    // 4. 难度：按玩家当前地图 loc_type 推断（wild/wild2/wild3 → 1/2/3 阶）
    const difficulty = await this.inferDifficulty(player.location_id);

    // 5. 生成蓝图（agent + enrich），失败有 fallback 兜底
    const blueprint = await this.generateBlueprint(
      sceneType,
      player.level,
      difficulty,
    );

    // 6. 落库
    const instance = this.repo.create({
      player_id: playerId,
      scene_type: blueprint.scene_type,
      title: blueprint.title,
      intro: blueprint.intro,
      acts: blueprint.acts,
      current_act: 1,
      status: 'active',
      difficulty,
      temp_items: '[]',
      encounter_id: encounterRefId,
    });
    const saved = await this.repo.save(instance);

    // 7. 玩家状态 → 秘境中
    await this.playerService.setStatus(playerId, PLAYER_STATUS.DUNGEON);
    this.logger.log(
      `🗝️ 玩家 ${playerId} 进入秘境：${blueprint.title}（${sceneType}·${difficulty}阶）`,
    );
    return saved;
  }

  /** 获取玩家当前进行中的副本（刷新恢复用） */
  async getCurrent(playerId: number): Promise<DungeonInstance | null> {
    return this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { created_at: 'DESC' },
    });
  }

  /** 推进下一幕；若已在最后一幕则通关 */
  async next(playerId: number): Promise<DungeonInstance> {
    const inst = await this.getCurrent(playerId);
    if (!inst) throw Biz.notFound('没有进行中的秘境');
    const total = Array.isArray(inst.acts) ? inst.acts.length : 5;
    if (inst.current_act >= total) {
      // 通关：本次第一期暂不结算临时背包（temp_items 留空）
      inst.status = 'completed';
      if (inst.encounter_id) {
        await this.encounterService.markDone(inst.encounter_id, playerId);
      }
      await this.playerService.setStatus(playerId, PLAYER_STATUS.IDLE);
      this.logger.log(`🏆 玩家 ${playerId} 通关秘境：${inst.title}`);
    } else {
      inst.current_act += 1;
    }
    return this.repo.save(inst);
  }

  /** 撤退：放弃秘境（本次临时背包留空，无结算损失） */
  async escape(playerId: number): Promise<DungeonInstance> {
    const inst = await this.getCurrent(playerId);
    if (!inst) throw Biz.notFound('没有进行中的秘境');
    inst.status = 'escaped';
    await this.repo.save(inst);
    await this.playerService.setStatus(playerId, PLAYER_STATUS.IDLE);
    this.logger.log(`🏃 玩家 ${playerId} 撤退秘境：${inst.title}`);
    return inst;
  }

  // ============ 蓝图生成 + 装配 ============

  /** 按玩家当前地图 loc_type 推断难度（1-3），非野外默认 1 */
  private async inferDifficulty(locationId: number | null): Promise<number> {
    if (!locationId) return 1;
    try {
      const node = await this.locationNetService.getNode(locationId);
      if (node && LOC_TYPE_TO_TIER[node.loc_type]) {
        return LOC_TYPE_TO_TIER[node.loc_type];
      }
    } catch {
      // 查询失败保守用一阶
    }
    return 1;
  }

  /** 生成蓝图：调 agent，失败用 fallbackBlueprint 兜底；再 enrichActs 装配 */
  private async generateBlueprint(
    sceneType: string,
    playerLevel: number,
    difficulty: number,
  ): Promise<DungeonBlueprint> {
    let blueprint: DungeonBlueprint;
    const data = await this.agentService.generateDungeon({
      scene_type: sceneType,
      player_level: playerLevel,
      difficulty,
    });
    if (data && Array.isArray(data.acts) && data.acts.length >= 5) {
      const acts = data.acts.slice(0, 5).map((a, i) => ({
        index: i + 1,
        type: String(a.type || 'combat'),
        title: String(a.title || `第${i + 1}幕`),
        narrative: String(a.narrative || ''),
      }));
      blueprint = {
        title: String(data.title || `${sceneType}秘境`),
        scene_type: String(data.scene_type || sceneType),
        intro: String(data.intro || ''),
        acts,
      };
    } else {
      this.logger.warn('秘境蓝图生成失败或幕数不足，使用降级方案');
      blueprint = this.fallbackBlueprint(sceneType, difficulty);
    }

    // 按难度装配魔兽数据 / 魔核奖励
    return this.enrichActs(blueprint, difficulty);
  }

  /** 按难度给 combat/boss 幕挂魔兽数据，给 item 幕挂魔核奖励 */
  private async enrichActs(
    bp: DungeonBlueprint,
    difficulty: number,
  ): Promise<DungeonBlueprint> {
    const cfg = TIER_CONFIG[difficulty] || TIER_CONFIG[1];
    for (const act of bp.acts) {
      if (act.type === 'combat' || act.type === 'boss') {
        const mob = await this.pickMob(cfg.mobLvMin, cfg.mobLvMax, act.type === 'boss');
        if (mob) {
          (act as any).mob = {
            mob_id: mob.mob_id,
            name: mob.name,
            attribute: mob.attribute,
            level: mob.level,
          };
        }
      } else if (act.type === 'item') {
        const reward = await this.pickCoreReward(cfg.coreKeyword);
        if (reward) {
          (act as any).reward = [reward];
          (act as any).picked = false;
          (act as any).reveal = `你发现了 ${reward.name} ×${reward.count}`;
        }
      }
    }
    return bp;
  }

  /** 从指定等阶(按 level 区间)的图鉴魔兽中随机抽取一只；boss 取该阶最强 */
  private async pickMob(
    lvMin: number,
    lvMax: number,
    boss: boolean,
  ): Promise<{ mob_id: string; name: string; attribute: string | null; level: number } | null> {
    const mobs = await this.mobService.findWBByLevelRange(
      lvMin,
      lvMax,
      boss ? 'DESC' : 'ASC',
    );
    if (!mobs.length) return null;
    if (boss) return mobs[0];
    return mobs[Math.floor(Math.random() * mobs.length)];
  }

  /** 从指定等阶魔核中随机抽一个，数量 1-3 */
  private async pickCoreReward(
    keyword: string,
  ): Promise<{ item_id: string; name: string; count: number; price: number } | null> {
    const cores = await this.itemService.findByTypeAndNameKeyword('魔核', keyword);
    if (!cores.length) return null;
    const c = cores[Math.floor(Math.random() * cores.length)];
    return {
      item_id: c.item_id,
      name: c.name,
      count: 1 + Math.floor(Math.random() * 3),
      price: c.price,
    };
  }

  /** 降级蓝图：agent 不可用时的固定 5 幕 */
  private fallbackBlueprint(sceneType: string, difficulty: number): DungeonBlueprint {
    const tierWord = TIER_CONFIG[difficulty]?.coreKeyword || '一阶';
    return {
      title: `${sceneType}秘境`,
      scene_type: sceneType,
      intro: `你进入了一处${sceneType}，四周弥漫着${tierWord}魔兽的气息。`,
      acts: [
        { index: 1, type: 'sneak', title: '入口守卫', narrative: `你刚踏入${sceneType}，一个黑影挡住了去路。` },
        { index: 2, type: 'item', title: '幽光乍现', narrative: `一阵幽幽微光从${sceneType}深处透出，散落之物似有灵气流转，引得你驻足。` },
        { index: 3, type: 'combat', title: '深处遭遇', narrative: `${sceneType}深处，一只凶兽正向你逼近。` },
        { index: 4, type: 'explore', title: '岔路抉择', narrative: `你发现${sceneType}中一处可疑的角落。` },
        { index: 5, type: 'boss', title: '最终之敌', narrative: `${sceneType}尽头，强敌现身，决一死战！` },
      ],
    };
  }
}
