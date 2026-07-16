import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Player } from './player.entity';
import { CharacterService } from '../character/character.service';
import { LocationService } from '../location/location.service';
import { TechniqueService } from '../technique/technique.service';
import { SkillService } from '../skill/skill.service';
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
  BATTLE: 7,
} as const;

export const STATUS_LABEL: Record<number, string> = {
  1: '空闲',
  2: '历练',
  3: '奇遇副本',
  4: '洞天福地修炼',
  5: '修炼室修炼',
  6: '采集',
  7: '战斗',
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
    private readonly techniqueService: TechniqueService,
    private readonly skillService: SkillService,
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
   * final_attrs 五维属性 = 玩家自身属性 + 已装备功法 base 加成；
   * max_hp = 含功法加成的 stamina × 10 + 功法 hp 加成；
   * max_energy = level × 20 + 功法 energy 加成。
   * （对齐老版本 dqdl-server 语义，宝物 hp/energy 加成待宝物系统接入后在此累加。）
   * techniques 为聚合后的功法详情数组（前端直接渲染），原始 technique JSON 字符串保留。
   */
  async findOne(id: number): Promise<any> {
    const player = await this.repo.findOneBy({ id });
    if (!player) return null;

    const techniques = await this.aggregateTechniques(player.technique);
    const skills = await this.aggregateSkills(player.skill);

    const techBonus = await this.computeTechBonus(player.technique);

    // 对齐老版本语义：max_hp = 含功法加成的 stamina × 10 + 功法 hp 加成；
    // max_energy = level × 20 + 功法 energy 加成。
    // player.max_hp/max_energy 是突破时持久化的基础值，功法加成只放大 final_attrs 的临时上限。
    const finalStamina = player.stamina + techBonus.stamina;
    const finalAttrs = {
      power: player.power + techBonus.power,
      intelligence: player.intelligence + techBonus.intelligence,
      quick: player.quick + techBonus.quick,
      stamina: finalStamina,
      lucky: player.lucky + techBonus.lucky,
      max_hp: finalStamina * 10 + techBonus.hp,
      max_energy: (player.level || 1) * 20 + techBonus.energy,
    };

    return {
      ...player,
      final_attrs: finalAttrs,
      techniques,
      skills,
      level_name: PlayerService.levelName(player.level),
      status_label: STATUS_LABEL[player.status] || '未知',
      cultivation_efficiency: 0, // 预留：宝物/功法修炼效率加成
    };
  }

  /**
   * 计算已装备功法的 base 属性加成之和（与 findOne / final_attrs 同源）。
   * 丹药回血/回气需用此加成后的上限做 clamp，否则会把功法放大的血量错误截回基础值。
   */
  private async computeTechBonus(rawTechnique: string | null): Promise<{
    power: number; intelligence: number; quick: number; stamina: number; lucky: number;
    hp: number; energy: number;
  }> {
    const techniques = await this.aggregateTechniques(rawTechnique);
    const bonus = {
      power: 0, intelligence: 0, quick: 0, stamina: 0, lucky: 0,
      hp: 0, energy: 0,
    };
    for (const t of techniques) {
      if (t.equipped && t.base_params) {
        for (const k of Object.keys(bonus)) {
          bonus[k] += Number(t.base_params[k]) || 0;
        }
      }
    }
    return bonus;
  }

  /**
   * 计算玩家当前的真实血/气上限（含已装备功法加成），供丹药等需要 clamp 的场景使用。
   * 对齐 final_attrs.max_hp / max_energy 公式。
   */
  async computeMaxHpEnergy(player: Player): Promise<{ maxHp: number; maxEnergy: number }> {
    const bonus = await this.computeTechBonus(player.technique);
    const finalStamina = player.stamina + bonus.stamina;
    return {
      maxHp: finalStamina * 10 + bonus.hp,
      maxEnergy: (player.level || 1) * 20 + bonus.energy,
    };
  }

  /**
   * 解析 player.technique(JSON 字符串) → 功法详情数组。
   * 玩家持有态元素结构：{id, level, cultivation, equipped}（id 为 technique 表主键）。
   * 批量按 id 查功法定义，合并出 {id, item_id, name, attribute, rank, level, max_level,
   * cultivation, max_cultivation, base_params, equipped}。
   * max_cultivation（升至下一级所需修为）由功法定义 base 数据驱动，一并给出供前端显示进度。
   * base_params 为该等级的属性加成（params），final_attrs 叠加已装备功法的此项。
   * 定义缺失（脏数据）的条目仍保留，name 落空由前端兜底。
   */
  /** 解析 player.technique(JSON) → 功法详情数组（含 max_cultivation/base_params）。
   *  public：供统一修炼引擎列出可修炼功法时复用。 */
  async aggregateTechniques(raw: string | null): Promise<any[]> {
    let arr: any[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      } catch {
        arr = [];
      }
    }
    if (arr.length === 0) return [];

    const ids = arr
      .map((e) => Number(e?.id))
      .filter((n) => Number.isFinite(n) && n > 0);
    const defs = ids.length ? await this.techniqueService.findByIds(ids) : [];
    const defMap = new Map(defs.map((d) => [d.id, d]));

    return arr.map((e) => {
      const def = defMap.get(Number(e?.id)) ?? null;
      const level = Number(e?.level) || 1;
      return {
        id: Number(e?.id),
        item_id: def?.item_id ?? null,
        name: def?.name ?? null,
        attribute: def?.attribute ?? null,
        rank: def?.rank ?? null,
        level,
        max_level: def?.max_level ?? null,
        cultivation: Number(e?.cultivation) || 0,
        max_cultivation: this.techniqueService.maxCultivationAtLevel(def, level),
        /** 该等级的属性加成（params），用于 final_attrs 叠加 */
        base_params: def ? this.techniqueService.parseBase(def.base, level) : {},
        description: def?.description ?? null,
        equipped: !!e?.equipped,
      };
    });
  }

  /**
   * 解析 player.skill(JSON 字符串) → 斗技详情数组。
   * 玩家持有态元素结构：{id, level, cultivation, carry}（id 为 skill 表主键，carry=1~5 表装备槽位）。
   * 批量按 id 查斗技定义，合并出 {id, item_id, name, attr, rank, level, max_level,
   * cultivation, max_cultivation, carry, energy_cost, description}。
   * max_cultivation（升至下一级所需修为）由公式 K(阶)*2^(level-1) 给出供前端显示进度。
   * 定义缺失（脏数据）的条目仍保留，name 落空由前端兜底。
   */
  /** 解析 player.skill(JSON) → 斗技详情数组（含 max_cultivation/energy_cost/carry）。
   *  public：供统一修炼引擎列出可修炼斗技时复用。 */
  async aggregateSkills(raw: string | null): Promise<any[]> {
    let arr: any[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      } catch {
        arr = [];
      }
    }
    if (arr.length === 0) return [];

    const ids = arr
      .map((e) => Number(e?.id))
      .filter((n) => Number.isFinite(n) && n > 0);
    const defs = ids.length ? await this.skillService.findByIds(ids) : [];
    const defMap = new Map(defs.map((d) => [d.id, d]));

    return arr.map((e) => {
      const def = defMap.get(Number(e?.id)) ?? null;
      const level = Number(e?.level) || 1;
      return {
        id: Number(e?.id),
        item_id: def?.item_id ?? null,
        name: def?.name ?? null,
        attr: def?.attr ?? null,
        rank: def?.rank ?? null,
        level,
        max_level: def?.max_level ?? null,
        cultivation: Number(e?.cultivation) || 0,
        max_cultivation: this.skillService.maxCultivationAtLevel(def, level),
        energy_cost: def?.energy_cost ?? 0,
        base_damage: def?.base_damage ?? 0,
        description: def?.description ?? null,
        /** carry=1~5 表示已装备到该槽位；null/其它表示未装备 */
        carry: Number(e?.carry) >= 1 && Number(e?.carry) <= 5 ? Number(e.carry) : null,
      };
    });
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
   * 修炼：按斗气浓郁度 qiDensity 结算修为收益，夹紧不超过 level_cultivation。
   *
   * 公式（与老版本一致）：
   *   growth = 已装备功法的 growth（默认 10）
   *   gained = round(qiDensity * (0.9 + rand*0.2) * growth / 100)
   *   10% 暴击 → gained × 3
   *   夹紧到 level_cultivation 上限
   *
   * @param qiDensity 斗气浓郁度（洞天福地 = BASE_QI × 星级倍率）
   * @returns 修炼结果详情（gained/critical/capped + 修为进度）
   */
  async cultivate(id: number, qiDensity: number = BASE_CULTIVATION_GAIN): Promise<{
    gained: number;
    critical: boolean;
    capped: boolean;
    cultivation: number;
    level_cultivation: number;
  }> {
    const player = await this.repo.findOneBy({ id });
    if (!player) throw Biz.notFound(`玩家 ${id} 不存在`);
    const lc = player.level_cultivation;

    // 已达上限：不增长（洞天福地结算会继续 tick 但 gained=0）
    if (player.cultivation >= lc) {
      return { gained: 0, critical: false, capped: true, cultivation: player.cultivation, level_cultivation: lc };
    }

    // 已装备功法的 growth（修炼效率系数）
    const growth = await this.getEquippedTechniqueGrowth(player);

    const factor = 0.9 + Math.random() * 0.2;
    let gained = Math.round((qiDensity * factor * growth) / 100);

    // 暴击：10% 概率三倍
    const critical = Math.random() < 0.1;
    if (critical) gained *= 3;

    // 上限截断
    let newCultivation = player.cultivation + gained;
    const capped = newCultivation > lc;
    if (capped) {
      gained = lc - player.cultivation;
      newCultivation = lc;
    }

    await this.repo.update(id, { cultivation: newCultivation as any });
    return { gained, critical, capped, cultivation: newCultivation, level_cultivation: lc };
  }

  /** 取已装备功法的 growth（修炼效率系数）；无装备功法则默认 10。
   *  public：供统一修炼引擎的离线补偿（compensate）按期望值批量结算时复用。 */
  async getEquippedTechniqueGrowth(player: Player): Promise<number> {
    try {
      const arr = player.technique ? JSON.parse(player.technique) : [];
      const equipped = (Array.isArray(arr) ? arr : []).find((t: any) => t?.equipped);
      if (equipped?.id) {
        const tech = await this.techniqueService.findOne(Number(equipped.id));
        if (tech?.growth) return tech.growth;
      }
    } catch {
      /* technique 非合法 JSON，降级默认值 */
    }
    return 10;
  }

  // ============ 修炼斗技 / 功法（修炼室 skill/technique 模式）============
  // 公式与 cultivate(qi) 一致：gained = round(qi × (0.9+rand*0.2) × growth / 100)，10%暴击×3。
  // 差异：斗技 growth 固定 10，满级前自动突破（lv+1 清零）；功法 growth=def.growth，满后夹紧不升级。

  /** 读取某项斗技的修炼进度（供修炼室 enter 校验/前端渲染） */
  async getSkillState(playerId: number, skillId: number): Promise<{
    name: string; level: number; cultivation: number; max_cultivation: number; max_level: number;
  } | null> {
    const player = await this.repo.findOneBy({ id: playerId });
    if (!player) return null;
    let arr: any[] = [];
    try { arr = JSON.parse(player.skill) || []; } catch { arr = []; }
    const entry = (Array.isArray(arr) ? arr : []).find((s) => Number(s.id) === Number(skillId));
    const def = await this.skillService.findOne(skillId);
    if (!entry || !def) return null;
    const lv = Number(entry.level) || 1;
    return {
      name: def.name,
      level: lv,
      cultivation: Number(entry.cultivation) || 0,
      max_cultivation: this.skillService.maxCultivationAtLevel(def, lv),
      max_level: def.max_level ?? 0,
    };
  }

  /** 读取某项功法的修炼进度（供修炼室 enter 校验/前端渲染） */
  async getTechniqueState(playerId: number, techniqueId: number): Promise<{
    name: string; level: number; cultivation: number; max_cultivation: number; max_level: number;
  } | null> {
    const player = await this.repo.findOneBy({ id: playerId });
    if (!player) return null;
    let arr: any[] = [];
    try { arr = JSON.parse(player.technique) || []; } catch { arr = []; }
    const entry = (Array.isArray(arr) ? arr : []).find((t) => Number(t.id) === Number(techniqueId));
    const def = await this.techniqueService.findOne(techniqueId);
    if (!entry || !def) return null;
    const lv = Number(entry.level) || 1;
    return {
      name: def.name,
      level: lv,
      cultivation: Number(entry.cultivation) || 0,
      max_cultivation: this.techniqueService.maxCultivationAtLevel(def, lv),
      max_level: def.max_level ?? 0,
    };
  }

  /**
   * 修炼斗技（修炼室 skill 模式每跳调用）。growth 固定 10（斗技无 growth 字段）。
   * 与功法区别：修为满后【自动突破】（等级+1、修为清零），可一直修炼直至 max_level（返回 maxed=true）。
   */
  async cultivateSkill(playerId: number, skillId: number, qiDensity: number): Promise<{
    gained: number; critical: boolean; level: number; cultivation: number;
    max_cultivation: number; maxed: boolean; leveledUp: boolean;
  }> {
    const player = await this.repo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    let arr: any[] = [];
    try { arr = JSON.parse(player.skill) || []; } catch { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    const entry = arr.find((s) => Number(s.id) === Number(skillId));
    if (!entry) throw Biz.badRequest('未习得该斗技');
    const def = await this.skillService.findOne(skillId);
    if (!def) throw Biz.notFound('斗技不存在');

    let lv = Number(entry.level) || 1;
    const maxLevel = def.max_level ?? 0;
    // 已达最高级
    if (maxLevel > 0 && lv >= maxLevel) {
      return { gained: 0, critical: false, level: lv, cultivation: Number(entry.cultivation) || 0, max_cultivation: 0, maxed: true, leveledUp: false };
    }

    const max = this.skillService.maxCultivationAtLevel(def, lv);
    const cur = Number(entry.cultivation) || 0;
    const growth = 10;
    const factor = 0.9 + Math.random() * 0.2;
    let gained = Math.round((qiDensity * factor * growth) / 100);
    const critical = Math.random() < 0.1;
    if (critical) gained *= 3;

    let newCult = cur + gained;
    let leveledUp = false;
    // 修为满 → 自动突破：等级+1、修为清零
    if (max > 0 && newCult >= max) {
      lv += 1; newCult = 0; leveledUp = true;
    }
    entry.level = lv;
    entry.cultivation = newCult;
    player.skill = JSON.stringify(arr);
    await this.repo.save(player);

    const maxed = maxLevel > 0 && lv >= maxLevel;
    return {
      gained, critical, level: lv, cultivation: newCult,
      max_cultivation: this.skillService.maxCultivationAtLevel(def, lv), maxed, leveledUp,
    };
  }

  /**
   * 修炼功法（修炼室 technique 模式每跳调用）。growth 取该功法定义 def.growth（默认10）。
   * 与斗技区别：修为满后【夹紧不升级】（返回 full=true 让修炼室停止），需玩家手动突破。
   */
  async cultivateTechnique(playerId: number, techniqueId: number, qiDensity: number): Promise<{
    gained: number; critical: boolean; cultivation: number; max_cultivation: number; full: boolean;
  }> {
    const player = await this.repo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    let arr: any[] = [];
    try { arr = JSON.parse(player.technique) || []; } catch { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    const entry = arr.find((t) => Number(t.id) === Number(techniqueId));
    if (!entry) throw Biz.badRequest('未习得该功法');
    const def = await this.techniqueService.findOne(techniqueId);
    if (!def) throw Biz.notFound('功法不存在');

    const lv = Number(entry.level) || 1;
    const max = this.techniqueService.maxCultivationAtLevel(def, lv);
    const cur = Number(entry.cultivation) || 0;
    if (max > 0 && cur >= max) {
      return { gained: 0, critical: false, cultivation: cur, max_cultivation: max, full: true };
    }

    const growth = def.growth ?? 10;
    const factor = 0.9 + Math.random() * 0.2;
    let gained = Math.round((qiDensity * factor * growth) / 100);
    const critical = Math.random() < 0.1;
    if (critical) gained *= 3;

    let newCult = cur + gained;
    const full = max > 0 && newCult >= max;
    if (full) { gained = max - cur; newCult = max; }

    entry.cultivation = newCult;
    player.technique = JSON.stringify(arr);
    await this.repo.save(player);

    return { gained, critical, cultivation: newCult, max_cultivation: max, full };
  }

  // ============ 离线补偿批量结算（修炼室 skill/technique 模式）============
  // 不逐轮调 cultivate（避免随机），用确定期望值批量写入。逐级模拟满后行为。

  /** 批量补发斗技修为（skill 模式离线补偿）：逐级模拟自动突破，受 max_level 截断。
   *  expectPerRound=单轮期望修为，rounds=补发轮数。返回累计获得修为 + 是否满级。 */
  async batchCultivateSkill(
    playerId: number,
    skillId: number,
    expectPerRound: number,
    rounds: number,
  ): Promise<{ gained: number; maxed: boolean; level: number; cultivation: number }> {
    const player = await this.repo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    let arr: any[] = [];
    try { arr = JSON.parse(player.skill) || []; } catch { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    const entry = arr.find((s) => Number(s.id) === Number(skillId));
    const def = await this.skillService.findOne(skillId);
    if (!entry || !def) return { gained: 0, maxed: false, level: 1, cultivation: 0 };

    let lv = Number(entry.level) || 1;
    let cur = Number(entry.cultivation) || 0;
    const maxLevel = def.max_level ?? 0;
    let remain = rounds;
    let gained = 0;

    while (remain > 0) {
      if (maxLevel > 0 && lv >= maxLevel) break; // 已满级
      const max = this.skillService.maxCultivationAtLevel(def, lv);
      if (max <= 0) {
        // 无上限设定：直接累加后跳出
        const add = expectPerRound * remain;
        cur += add; gained += add; remain = 0;
        break;
      }
      const need = max - cur; // 当前级到满还差多少
      const costRounds = Math.min(remain, Math.ceil(need / expectPerRound));
      const add = Math.min(expectPerRound * costRounds, need);
      cur += add; gained += add; remain -= costRounds;
      if (cur >= max) { lv += 1; cur = 0; } // 自动突破
      else break; // 剩余轮不足以升满当前级
    }

    const maxed = maxLevel > 0 && lv >= maxLevel;
    entry.level = lv;
    const finalMax = this.skillService.maxCultivationAtLevel(def, lv);
    entry.cultivation = finalMax > 0 ? Math.min(cur, finalMax) : cur;
    player.skill = JSON.stringify(arr);
    await this.repo.save(player);
    return { gained, maxed, level: lv, cultivation: entry.cultivation };
  }

  /** 批量补发功法修为（technique 模式离线补偿）：补到当前级上限（不升级），写回 JSON。
   *  返回累计获得修为 + 是否已满。 */
  async batchCultivateTechnique(
    playerId: number,
    techniqueId: number,
    expectPerRound: number,
    rounds: number,
  ): Promise<{ gained: number; full: boolean; cultivation: number }> {
    const player = await this.repo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    let arr: any[] = [];
    try { arr = JSON.parse(player.technique) || []; } catch { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    const entry = arr.find((t) => Number(t.id) === Number(techniqueId));
    const def = await this.techniqueService.findOne(techniqueId);
    if (!entry || !def) return { gained: 0, full: false, cultivation: 0 };

    const lv = Number(entry.level) || 1;
    const max = this.techniqueService.maxCultivationAtLevel(def, lv);
    const cur = Number(entry.cultivation) || 0;
    const add = expectPerRound * rounds;
    const after = max > 0 ? Math.min(cur + add, max) : cur + add;
    const gained = after - cur;
    entry.cultivation = after;
    player.technique = JSON.stringify(arr);
    await this.repo.save(player);
    return { gained, full: max > 0 && after >= max, cultivation: after };
  }

  /** 保存 player 实体（供修炼引擎补偿直接写回聚合后的 JSON 字段） */
  async saveEntity(player: Player): Promise<void> {
    await this.repo.save(player);
  }

  /** 取某功法定义的 growth（修炼效率系数）；缺失默认 10。
   *  供统一修炼引擎 technique 模式离线补偿算期望值用。 */
  async getTechniqueDefGrowth(techniqueId: number): Promise<number> {
    const def = await this.techniqueService.findOne(techniqueId);
    return def?.growth ?? 10;
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

  /**
   * 更新玩家斗技装配：前端斗技弹窗拖拽/点击装配后，把整份 skill JSON 回传。
   * 元素结构：{id, level, cultivation, carry}（carry=1~5 装备槽位，null=未装备）。
   * 后端只做基本校验：元素须含合法 id、carry 落在 1~5 或空、槽位不重复，不重算属性。
   * @returns 聚合后的最新玩家数据（含 skills 数组）
   */
  async updateSkillEquip(playerId: number, skillJson: string): Promise<any> {
    const player = await this.repo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);

    let arr: any[] = [];
    try {
      const parsed = JSON.parse(skillJson);
      if (Array.isArray(parsed)) arr = parsed;
      else throw new Error('skill 必须是数组');
    } catch {
      throw Biz.badRequest('skill JSON 格式错误');
    }

    // 规整：保留 id/level/cultivation，carry 限 1~5 或 null
    const seenSlots = new Set<number>();
    const cleaned = arr
      .filter((e) => Number(e?.id) > 0)
      .map((e) => {
        let carry: number | null = Number(e?.carry);
        carry = carry >= 1 && carry <= 5 ? carry : null;
        // 槽位唯一：重复槽位降级为未装备
        if (carry !== null) {
          if (seenSlots.has(carry)) carry = null;
          else seenSlots.add(carry);
        }
        return {
          id: Number(e.id),
          level: Number(e?.level) || 1,
          cultivation: Number(e?.cultivation) || 0,
          ...(carry !== null ? { carry } : {}),
        };
      });

    player.skill = JSON.stringify(cleaned);
    await this.repo.save(player);
    return this.findOne(playerId);
  }

  /** 获取 player 实体（原始，非聚合），供其他 service 使用 */
  async getEntity(playerId: number): Promise<Player | null> {
    return this.repo.findOneBy({ id: playerId });
  }

  /** 直接设置玩家状态（供历练等活动 service 使用） */
  async setStatus(playerId: number, status: number): Promise<void> {
    await this.repo.update({ id: playerId }, { status });
  }

  /** 部分字段更新（供战斗等模块持久化 hp/energy 等运行时状态） */
  async patch(playerId: number, updates: Partial<Player>): Promise<void> {
    await this.repo.update({ id: playerId }, updates as any);
  }

  /**
   * 增减金币（正数加、负数扣）。扣金币时余额不足会夹紧到 0（调用方应先校验）。
   * 用 increment 原子操作，避免并发读写。
   * @returns 更新后的金币余额
   */
  async grantMoney(playerId: number, delta: number): Promise<number> {
    if (delta === 0) {
      const p = await this.repo.findOneBy({ id: playerId });
      return p?.money ?? 0;
    }
    await this.repo.increment({ id: playerId }, 'money', delta);
    const p = await this.repo.findOneBy({ id: playerId });
    // 扣超了夹紧到 0（理论上调用方先校验，这里兜底）
    if (p && p.money < 0) {
      p.money = 0;
      await this.repo.save(p);
    }
    return p?.money ?? 0;
  }

  /**
   * 直接设置修为（绝对值），供统一修炼引擎的离线补偿（compensate）批量结算用。
   * 由调用方保证不超过 level_cultivation（已在 cultivation service 内夹紧）。
   */
  async setCultivation(playerId: number, value: number): Promise<void> {
    await this.repo.update({ id: playerId }, { cultivation: value as any });
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

  /**
   * 按 user 查 player（当前活动角色）。
   * 取该 user 下 slot 最小的角色对应的 player。
   * 供 training 等接口直接从 JWT user 拿 player。
   */
  async verifyOwnershipByUser(userId: number): Promise<Player> {
    const characters = await this.characterService.listByUser(userId);
    if (characters.length === 0) {
      throw Biz.notFound('该账号下无角色');
    }
    // 取第一个角色（slot 最小）的 player
    const player = await this.repo.findOneBy({ character_id: characters[0].id });
    if (!player) throw Biz.notFound('玩家数据不存在');
    return player;
  }

  /** 校验玩家空闲，否则抛状态冲突。返回 player 实体供后续操作。
   *  public：供 cultivation/dungeon/training 等活动 service 进入前校验。 */
  async assertIdle(id: number): Promise<Player> {
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
