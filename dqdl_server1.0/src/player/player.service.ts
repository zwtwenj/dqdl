import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Player } from './player.entity';
import { CharacterService } from '../character/character.service';
import { LocationService } from '../location/location.service';
import { Biz } from '../common/biz.exception';

/** 等阶 K 常量：1-9=100, 11-19=200, 21-29=300, 31+=400 */
export function getLevelK(level: number): number {
  if (level >= 31) return 400;
  if (level >= 21) return 300;
  if (level >= 11) return 200;
  return 100;
}

/** level_cultivation = K * level^2 */
export function calcLevelCultivation(level: number): number {
  return getLevelK(level) * level * level;
}

/**
 * 等级带来的「全属性加成」：1-9 级每升 1 级全属性 +3；10 级起不再增长。
 * 玩家属性 = 基础属性(创建固定) + levelAttrBonus(等级)。
 */
export function levelAttrBonus(level: number): number {
  return Math.max(0, Math.min(level, 9) - 1) * 3;
}

/**
 * 玩家活动状态码（后端唯一权威）。各活动开始前用 assertIdle 校验。
 */
export const PLAYER_STATUS = {
  IDLE: 1,
  TRAINING: 2,
  DUNGEON: 3,
  CULTIVATING: 4,
  ROOM_CULTIVATING: 5,
  GATHERING: 6,
} as const;

export const STATUS_LABEL: Record<number, string> = {
  1: '空闲',
  2: '历练',
  3: '奇遇副本',
  4: '洞天福地修炼',
  5: '修炼室修炼',
  6: '采集',
};

/** 修炼基础收益（后续可被宝物/功法效率加成放大） */
const BASE_CULTIVATION_GAIN = 10;

/**
 * 玩家服务：核心属性系统，status 由后端统一处理。
 *
 * 属性真值持久化在 DB（base_* + 当前属性），final_attrs 由 findOne 实时聚合返回。
 * 当前无功法/宝物加成，final_attrs = player 属性本身，结构预留后续扩展。
 */
@Injectable()
export class PlayerService {
  constructor(
    @InjectRepository(Player)
    private readonly repo: Repository<Player>,
    private readonly characterService: CharacterService,
    private readonly locationService: LocationService,
  ) {}

  /** 等级名称：1-9 斗之气段 / 11-19 斗者星 / ... */
  static levelName(level: number): string {
    if (level <= 9) return `斗之气${level}段`;
    if (level <= 19) return `${level - 9}星斗者`;
    if (level <= 29) return `${level - 19}星斗师`;
    if (level <= 39) return `${level - 29}星大斗师`;
    return `斗灵${level - 39}阶`;
  }

  /** 突破基础成功率：1-9=80%, 10-19=70%, 20+=60% */
  static breakthroughRate(level: number): number {
    if (level <= 9) return 80;
    if (level <= 19) return 70;
    return 60;
  }

  /**
   * 为角色创建 player（幂等：已存在则返回）。
   * 初始化基础属性（默认 power10/int8/quick7/stamina9/lucky6）+ 等级成长 +
   * max_hp(stamina*10) + max_energy(level*20) + level_cultivation。
   */
  async createForCharacter(
    characterId: number,
    name: string,
    locationId: number,
  ): Promise<Player> {
    const existing = await this.repo.findOneBy({ character_id: characterId });
    if (existing) return existing;

    const level = 1;
    const bonus = levelAttrBonus(level);
    // 基础属性（创建固定，与旧项目 newGame 默认值一致）
    const base = { power: 10, intelligence: 8, quick: 7, stamina: 9, lucky: 6 };
    const stamina = base.stamina + bonus;

    const player = this.repo.create({
      character_id: characterId,
      name,
      level,
      location_id: locationId,
      base_power: base.power,
      base_intelligence: base.intelligence,
      base_quick: base.quick,
      base_stamina: base.stamina,
      base_lucky: base.lucky,
      power: base.power + bonus,
      intelligence: base.intelligence + bonus,
      quick: base.quick + bonus,
      stamina,
      lucky: base.lucky + bonus,
      hp: stamina * 10,
      max_hp: stamina * 10,
      energy: level * 20,
      max_energy: level * 20,
      cultivation: 0,
      level_cultivation: calcLevelCultivation(level),
      money: 0,
      buff: null,
      skill: '[]',
      technique: '[]',
      treasures: '[]',
      extra_attrs: '{}',
      breakthrough_bonus: 0,
      status: PLAYER_STATUS.IDLE,
    });
    return this.repo.save(player);
  }

  /**
   * 查询 player 并聚合 final_attrs（后端统一计算 status）。
   * 当前无功法/宝物，final_attrs = player 属性；后续接入 technique/treasure 时在此聚合。
   */
  async findOne(id: number): Promise<any> {
    const player = await this.repo.findOneBy({ id });
    if (!player) return null;

    const finalAttrs = {
      power: player.power,
      intelligence: player.intelligence,
      quick: player.quick,
      stamina: player.stamina,
      lucky: player.lucky,
      max_hp: player.max_hp,
      max_energy: player.max_energy,
    };

    return {
      ...player,
      final_attrs: finalAttrs,
      level_name: PlayerService.levelName(player.level),
      status_label: STATUS_LABEL[player.status] || '未知',
      cultivation_efficiency: 0, // 预留：宝物/功法修炼效率加成
    };
  }

  /** 查询角色的 player（聚合结果） */
  async findByCharacterId(characterId: number): Promise<any> {
    const player = await this.repo.findOneBy({ character_id: characterId });
    if (!player) return null;
    return this.findOne(player.id);
  }

  /** 轻量状态查询（轮询用） */
  async getStatus(id: number): Promise<any> {
    const player = await this.repo.findOneBy({ id });
    if (!player) return null;
    return {
      id: player.id,
      status: player.status,
      status_label: STATUS_LABEL[player.status] || '未知',
      hp: player.hp,
      max_hp: player.max_hp,
      energy: player.energy,
      max_energy: player.max_energy,
      level: player.level,
      level_name: PlayerService.levelName(player.level),
      cultivation: player.cultivation,
      level_cultivation: player.level_cultivation,
      money: player.money,
    };
  }

  /**
   * 修炼：cultivation += 基础值(10)，夹紧不超过 level_cultivation。
   * 后续可接入修炼效率加成（宝物/功法）。
   */
  async cultivate(id: number): Promise<any> {
    const player = await this.assertIdle(id);
    const gain = Math.round(
      BASE_CULTIVATION_GAIN * (1 + 0), // 预留效率加成
    );
    player.cultivation = Math.min(
      player.cultivation + gain,
      player.level_cultivation,
    );
    await this.repo.save(player);
    return this.findOne(id);
  }

  /**
   * 突破：修为满后判定成功/失败。
   * 成功：level+1，重算属性(base+新bonus)、max_hp/max_energy/level_cultivation，
   *       cultivation 清零、breakthrough_bonus 清零，hp/energy 回满。
   * 失败：cultivation 扣减一半，breakthrough_bonus 清零。
   */
  async breakthrough(id: number): Promise<any> {
    const player = await this.assertIdle(id);
    if (player.cultivation < player.level_cultivation) {
      throw Biz.conflict('修为不足，无法突破');
    }

    const baseRate = PlayerService.breakthroughRate(player.level);
    const rate = Math.min(100, baseRate + player.breakthrough_bonus);
    const success = Math.random() * 100 < rate;

    if (success) {
      player.level += 1;
      const bonus = levelAttrBonus(player.level);
      player.power = player.base_power + bonus;
      player.intelligence = player.base_intelligence + bonus;
      player.quick = player.base_quick + bonus;
      player.stamina = player.base_stamina + bonus;
      player.lucky = player.base_lucky + bonus;
      player.max_hp = player.stamina * 10;
      player.max_energy = player.level * 20;
      player.hp = player.max_hp;
      player.energy = player.max_energy;
      player.cultivation = 0;
      player.level_cultivation = calcLevelCultivation(player.level);
      player.breakthrough_bonus = 0;
    } else {
      player.cultivation = Math.floor(player.cultivation / 2);
      player.breakthrough_bonus = 0;
    }

    await this.repo.save(player);
    return { ...await this.findOne(id), breakthrough_success: success };
  }

  /**
   * 切换玩家当前地点（不校验层级，只校验目标地点存在）。
   * 更新 location_id，返回聚合后的 player。
   */
  async moveToLocation(playerId: number, locationId: number): Promise<any> {
    const player = await this.repo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    // 校验目标地点存在
    await this.locationService.findOne(locationId);
    player.location_id = locationId;
    await this.repo.save(player);
    return this.findOne(playerId);
  }

  /** 删除角色的 player（删角色时级联） */
  async removeByCharacterId(characterId: number): Promise<void> {
    await this.repo.delete({ character_id: characterId });
  }

  /**
   * 校验 player 属于当前 user（安全）。
   * player → character_id → character.user_id === userId
   */
  async verifyOwnership(playerId: number, userId: number): Promise<Player> {
    const player = await this.repo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    const character = await this.characterService.findOneById(player.character_id);
    if (!character || character.user_id !== userId) {
      throw Biz.forbidden('无权操作该角色');
    }
    return player;
  }

  /** 校验玩家空闲，否则抛状态冲突。返回 player 实体供后续操作。 */
  private async assertIdle(id: number): Promise<Player> {
    const player = await this.repo.findOneBy({ id });
    if (!player) throw Biz.notFound(`玩家 ${id} 不存在`);
    if (player.status !== PLAYER_STATUS.IDLE) {
      throw Biz.conflict(
        `当前状态为「${STATUS_LABEL[player.status] || '忙碌'}」，无法操作`,
      );
    }
    return player;
  }
}
