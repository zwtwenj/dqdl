import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Player } from './player.entity';
import { CreatePlayerDto } from './dto/create-player.dto';
import { TechniqueService, techniqueBreakthroughBaseRate } from '../technique/technique.service';
import { TreasureService } from '../treasure/treasure.service';
import { SkillService } from '../skill/skill.service';
import { BuffService } from '../buff/buff.service';
import { Buff } from '../buff/buff.entity';
import { AgentClient } from '../agent/agent.client';

/** 等阶 K 常量：1-9=100, 11-19=200, 21-29=300, 31-39=400 */
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
 * 等级带来的「全属性加成」：1-9 级每升 1 级全属性 +3；10 级起不再增长（后续等级待实现）。
 * 该规则只与等级有关；玩家属性 = 基础属性(创建时固定) + levelAttrBonus(等级)，
 * 突破只是把属性按新等级重算（同步），而非在事件里硬写 +3。
 */
export function levelAttrBonus(level: number): number {
  return Math.max(0, Math.min(level, 9) - 1) * 3;
}

@Injectable()
export class PlayerService {
  private readonly logger = new Logger(PlayerService.name);

  constructor(
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
    private readonly techniqueService: TechniqueService,
    private readonly treasureService: TreasureService,
    private readonly skillService: SkillService,
    private readonly buffService: BuffService,
    private readonly agentClient: AgentClient,
  ) {}

  async create(dto: CreatePlayerDto): Promise<Player> {
    const tech = await this.techniqueService.findOne(1);
    const techBase = tech ? this.techniqueService.parseBase(tech.base, 1) : {};

    const finalStamina = (dto.stamina || 5) + (techBase.stamina || 0);
    const maxHp = finalStamina * 10 + (techBase.hp || 0);
    const maxEnergy = (dto.level || 1) * 20 + (techBase.energy || 0);

    const player = this.playerRepo.create(dto);
    // 基础属性 = 创建时数值（固定）；当前属性 = 基础 + 等级成长。等级成长只与等级有关。
    const bonus = levelAttrBonus(player.level || 1);
    player.base_power = dto.power ?? 0;
    player.base_intelligence = dto.intelligence ?? 0;
    player.base_quick = dto.quick ?? 0;
    player.base_stamina = dto.stamina ?? 0;
    player.base_lucky = dto.lucky ?? 0;
    player.power = player.base_power + bonus;
    player.intelligence = player.base_intelligence + bonus;
    player.quick = player.base_quick + bonus;
    player.stamina = player.base_stamina + bonus;
    player.lucky = player.base_lucky + bonus;
    player.hp = maxHp;
    player.max_hp = maxHp;
    player.energy = maxEnergy;
    player.max_energy = maxEnergy;
    player.buff = '[]';
    player.money = 0;
    player.exp = 0;
    player.cultivation = 0;
    player.extra_attrs = '{}';
    player.skill = '[]';
    player.level_cultivation = calcLevelCultivation(player.level || 1);
    player.technique_id = 1;
    // 初始习得功法(弄焰诀)等级1、修为0、默认装配；max_cultivation 属于功法定义(base)，不存入玩家状态
    player.technique = JSON.stringify([{ id: 1, level: 1, cultivation: 0, equipped: true }]);
    player.position = dto.position || '';
    player.status = 1;
    return this.playerRepo.save(player);
  }

  async findOne(id: number): Promise<any> {
    const player = await this.playerRepo.findOneBy({ id });
    if (!player) return null;

    // 当前「装配中」的功法（由 player.technique 数组中的 equipped 标记决定，与 skill.carry 同构）
    const equipped = this.getEquippedEntry(player);
    const tech = equipped ? await this.techniqueService.findOne(equipped.id) : null;
    const techLevel = equipped?.level ?? 1;
    const techBase = tech ? this.techniqueService.parseBase(tech.base, techLevel) : {};

    // 已装备宝物的属性加成之和
    const trStats = await this.sumEquippedTreasureStats(player);
    // 已装备宝物的被动效果（修炼效率等）
    const trEffects = await this.sumEquippedTreasureEffects(player);

    const finalAttrs = {
      power: player.power + (techBase.power || 0) + (trStats.power || 0),
      intelligence: player.intelligence + (techBase.intelligence || 0) + (trStats.intelligence || 0),
      quick: player.quick + (techBase.quick || 0) + (trStats.quick || 0),
      stamina: player.stamina + (techBase.stamina || 0) + (trStats.stamina || 0),
      max_hp: player.max_hp,
      max_energy: player.max_energy,
      lucky: player.lucky + (techBase.lucky || 0) + (trStats.lucky || 0),
    };

    // 已习得功法列表（附带定义与进度，供前端装配界面渲染）
    const learned = this.parseTechnique(player.technique);
    const defList = learned.length ? await this.techniqueService.findByIds(learned.map((t) => Number(t.id))) : [];
    const defMap = new Map(defList.map((d) => [d.id, d]));
    const techniques = learned.map((t) => {
      const def = defMap.get(Number(t.id));
      const lv = Number(t.level) || 1;
      return {
        id: Number(t.id),
        name: def?.name || '未知功法',
        attribute: def?.attribute || '',
        rank: def?.rank ?? null,
        description: def?.description || '',
        growth: def?.growth ?? 0,
        max_level: def?.max_level ?? 0,
        level: lv,
        cultivation: Number(t.cultivation) || 0,
        max_cultivation: def ? this.techniqueService.maxCultivationAtLevel(def, lv) : 0,
        breakthrough_rate: def ? techniqueBreakthroughBaseRate(def.rank) : 50,
        base: def ? this.techniqueService.parseBase(def.base, lv) : {},
        equipped: !!t.equipped,
      };
    });

    // 已装备宝物（附带定义，供前端宝物栏渲染）
    const trEntries = this.parseTreasures(player.treasures);
    const trDefs = trEntries.length ? await this.treasureService.findByIds(trEntries.map((t) => Number(t.id))) : [];
    const trDefMap = new Map(trDefs.map((d) => [d.id, d]));
    const treasures = trEntries.map((t) => {
      const def = trDefMap.get(Number(t.id));
      return {
        id: Number(t.id),
        slot: Number(t.slot) || null,
        name: def?.name || '未知宝物',
        category: def?.category || '饰品',
        rank: def?.rank ?? null,
        icon: def?.icon || null,
        description: def?.description || '',
        stats: def ? this.treasureService.parseStats(def.stats) : {},
        effects: def ? this.treasureService.parseEffects(def.effects) : {},
      };
    });

    // 已习得斗技（含完整展示信息：伤害公式 + 附带效果；附带 buff 的名称/描述在此 join，
    // 前端无需再请求 skill/buff 全量表）
    const skEntries = this.parseSkill(player.skill);
    const skDefs = skEntries.length ? await this.skillService.findByIds(skEntries.map((s) => Number(s.id))) : [];
    const skDefMap = new Map(skDefs.map((d) => [d.id, d]));
    const buffDefs = skEntries.length ? await this.buffService.findAll() : [];
    const buffMap = new Map(buffDefs.map((b) => [b.key, b]));
    const skills = skEntries.map((s) => {
      const def = skDefMap.get(Number(s.id));
      return this.presentSkill(def, Number(s.level) || 1, buffMap, (s as any).carry ?? null, Number(s.cultivation) || 0);
    });

    return {
      ...player,
      technique: tech
        ? {
            ...tech,
            base: techBase, // 已按玩家功法等级解析出的本级参数
            level: techLevel,
            cultivation: equipped?.cultivation ?? 0,
            // max_cultivation 取自功法定义(base)中该等级的声明，而非玩家状态
            max_cultivation: this.techniqueService.maxCultivationAtLevel(tech, techLevel),
          }
        : null,
      techniques,
      treasures,
      skills,
      final_attrs: finalAttrs,
      // 修炼效率加成(百分点)：修炼收益 = 基础 × (100 + 此值) / 100
      cultivation_efficiency: trEffects.cultivation_efficiency || 0,
    };
  }

  /** 解析玩家功法进度数组 */
  private parseTechnique(raw: string | null | undefined): any[] {
    try {
      const a = JSON.parse(raw || '[]');
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  }

  /** 解析玩家斗技列表数组 */
  private parseSkill(raw: string | null | undefined): any[] {
    try {
      const a = JSON.parse(raw || '[]');
      return Array.isArray(a) ? a : [];
    } catch {
      return [];
    }
  }

  private parseLevels(raw: string | null | undefined): any[] {
    try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
  }
  private parseEffectEntries(raw: string | null | undefined): { buff: string; paramKey?: string }[] {
    let arr: any;
    try { arr = JSON.parse(raw || '[]'); } catch { arr = []; }
    if (!Array.isArray(arr)) return [];
    return arr.map((e) => (typeof e === 'string' ? { buff: e } : { buff: e.buff, paramKey: e.paramKey }));
  }
  private formatSkillParam(key: string, val: number): string | null {
    if (key === 'armorPen') return `穿透 ${Math.round(val * 100)}%`;
    if (key === 'burnRate') return `灼烧 ×${val}`;
    if (key === 'bleedRate') return `流血 ×${val}`;
    if (key === 'shieldAmount') return `护盾 ${val}`;
    return null; // 未知 paramKey 不展示，避免出现原始键名
  }
  /**
   * 组装单条斗技的展示视图：基础信息 + 修炼进度 + 伤害公式 + 附带效果。
   * 附带 buff 的名称/图标/描述在此用 buffMap join，前端不再直接请求 buff 表。
   */
  private presentSkill(
    def: any | undefined,
    level: number,
    buffMap: Map<string, Buff>,
    carry: any,
    cultivation: number,
  ): any {
    const lvEntry = def ? this.parseLevels(def.levels).find((e) => Number(e?.level) === level) : null;
    const P = (lvEntry && (lvEntry as any).params) || {};
    const buildGroup = (raw: string | null, tag: string) => ({
      tag,
      items: this.parseEffectEntries(raw).map((e) => {
        const b = buffMap.get(e.buff);
        const val = e.paramKey && P[e.paramKey] != null ? Number(P[e.paramKey]) : null;
        let desc = b?.description || '';
        let param: string | null = null;
        if (val != null) {
          if (desc.includes('{')) {
            // 描述含占位符（如护盾「吸收{amount}点伤害」）：直接代入当前等级数值，不再额外显示 param 避免重复
            desc = desc.replace(/\{([^{}]+?)(%?)\}/g, (_m, _k: string, pct: string) =>
              pct ? Math.round(val * 100) + '%' : String(val));
          } else {
            param = this.formatSkillParam(e.paramKey!, val);
          }
        }
        return { icon: b?.icon || '✦', name: b?.name || e.buff, description: desc, param };
      }),
    });
    return {
      id: def?.id ?? 0,
      carry: carry ?? null,
      name: def?.name || '未知斗技',
      rank: def?.rank ?? null,
      level,
      max_level: def?.max_level ?? 0,
      cultivation,
      max_cultivation: def ? this.skillService.maxCultivationAtLevel(def, level) : 0,
      description: def?.description || '',
      attr: def?.attr || 'power',
      base_damage: def?.base_damage || 0,
      energy_cost: def?.energy_cost || 0,
      damageRate: Number(P.damageRate ?? 1),
      groups: def ? [
        buildGroup(def.carried, '携带效果'),
        buildGroup(def.target_effects, '命中附加'),
        buildGroup(def.self_effects, '自身增益'),
      ] : [],
    };
  }

  /** 读取当前「装配中」的功法进度：{id, level, cultivation}（未装配返回 null） */
  private getEquippedEntry(player: Player): { id: number; level: number; cultivation: number } | null {
    const e = this.parseTechnique(player.technique).find((t) => t.equipped);
    if (!e) return null;
    return {
      id: Number(e.id),
      level: Number(e.level) || 1,
      cultivation: Number(e.cultivation) || 0,
    };
  }

  /** 按当前装配的功法重算生命/斗气上限，并夹紧当前值（装配/卸下时调用） */
  /** 按当前装配的功法 + 宝物重算生命/斗气上限，并夹紧当前值（装配/卸下/突破时调用） */
  private async applyEquippedTechniqueToMax(player: Player): Promise<void> {
    const equipped = this.getEquippedEntry(player);
    const tech = equipped ? await this.techniqueService.findOne(equipped.id) : null;
    const techBase = tech ? this.techniqueService.parseBase(tech.base, equipped?.level ?? 1) : {};
    const trStats = await this.sumEquippedTreasureStats(player);
    const finalStamina = player.stamina + (techBase.stamina || 0);
    // 宝物 hp/energy 走"固定加成"（不再经 stamina×10，避免一件高体质宝物爆血）
    player.max_hp = finalStamina * 10 + (techBase.hp || 0) + (trStats.hp || 0);
    player.max_energy = (player.level || 1) * 20 + (techBase.energy || 0) + (trStats.energy || 0);
    if (player.hp > player.max_hp) player.hp = player.max_hp;
    if (player.energy > player.max_energy) player.energy = player.max_energy;
  }

  // ── 宝物（treasures） ──
  private parseTreasures(raw: string | null | undefined): any[] {
    try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
  }

  /** 汇总已装备宝物的属性加成 */
  private async sumEquippedTreasureStats(player: Player): Promise<Record<string, number>> {
    const entries = this.parseTreasures(player.treasures);
    if (!entries.length) return {};
    const defs = await this.treasureService.findByIds(entries.map((t) => Number(t.id)));
    const map = new Map(defs.map((d) => [d.id, d]));
    const sum: Record<string, number> = {};
    for (const e of entries) {
      const def = map.get(Number(e.id));
      if (!def) continue;
      const s = this.treasureService.parseStats(def.stats);
      for (const k of Object.keys(s)) sum[k] = (sum[k] || 0) + (Number(s[k]) || 0);
    }
    return sum;
  }

  /** 解析玩家扩展属性 JSON */
  private parseExtraAttrs(player: Player): Record<string, any> {
    try { const v = JSON.parse(player.extra_attrs || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  }

  /** 汇总已装备宝物的被动效果（如修炼效率 cultivation_efficiency） */
  private async sumEquippedTreasureEffects(player: Player): Promise<Record<string, number>> {
    const entries = this.parseTreasures(player.treasures);
    if (!entries.length) return {};
    const defs = await this.treasureService.findByIds(entries.map((t) => Number(t.id)));
    const map = new Map(defs.map((d) => [d.id, d]));
    const sum: Record<string, number> = {};
    for (const e of entries) {
      const def = map.get(Number(e.id));
      if (!def) continue;
      const f = this.treasureService.parseEffects(def.effects);
      for (const k of Object.keys(f)) sum[k] = (sum[k] || 0) + (Number(f[k]) || 0);
    }
    return sum;
  }

  /** 重算修炼效率并写入 extra_attrs（装备/卸下宝物时调用，保证 extra_attrs 可直接查看） */
  private async recalcCultivationEfficiency(player: Player): Promise<void> {
    const x = (await this.sumEquippedTreasureEffects(player)).cultivation_efficiency || 0;
    const attrs = this.parseExtraAttrs(player);
    attrs.cultivation_efficiency = x;
    player.extra_attrs = JSON.stringify(attrs);
  }

  /**
   * 使用宝物"物品形态" → 装备到宝物栏：占用一个空槽（1-5），校验同类上限，
   * 加入 player.treasures 并重算属性。物品本身的扣减由调用方（背包use）负责。
   */
  async equipTreasureFromItem(playerId: number, treasureId: number): Promise<{ ok: boolean; error?: string; message?: string; player?: any }> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) return { ok: false, error: '玩家不存在' };
    const def = await this.treasureService.findOne(treasureId);
    if (!def) return { ok: false, error: '宝物不存在' };

    const arr = this.parseTreasures(player.treasures);
    const usedSlots = new Set(arr.map((t) => Number(t.slot)));
    const freeSlot = [1, 2, 3, 4, 5].find((s) => !usedSlots.has(s));
    if (!freeSlot) return { ok: false, error: '宝物栏已满（5/5）' };

    if (def.unique_cat_max && def.unique_cat_max > 0) {
      const sameCat = arr.filter((t) => Number(t.id) !== Number(treasureId))
        .map((t) => t.id);
      const sameCatDefs = sameCat.length ? await this.treasureService.findByIds(sameCat.map(Number)) : [];
      const cnt = sameCatDefs.filter((d) => d.category === def.category).length;
      if (cnt >= def.unique_cat_max) return { ok: false, error: `${def.category}类宝物最多携带 ${def.unique_cat_max} 件` };
    }

    arr.push({ id: Number(treasureId), slot: freeSlot });
    player.treasures = JSON.stringify(arr);
    await this.applyEquippedTechniqueToMax(player);
    await this.recalcCultivationEfficiency(player);
    await this.playerRepo.save(player);
    this.logger.log(`玩家 ${playerId} 装备宝物 ${def.name} 到槽位 ${freeSlot}`);
    return { ok: true, message: `装备宝物：${def.name}`, player: await this.findOne(playerId) };
  }

  /** 从宝物栏卸下指定槽位：移除条目并重算属性；返回宝物定义(含 item_id)供调用方返还物品 */
  async removeTreasureEntry(playerId: number, slot: number): Promise<{ treasureId: number; itemId: string | null } | null> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) return null;
    const arr = this.parseTreasures(player.treasures);
    const idx = arr.findIndex((t) => Number(t.slot) === Number(slot));
    if (idx < 0) return null;
    const removed = arr.splice(idx, 1)[0];
    player.treasures = JSON.stringify(arr);
    await this.applyEquippedTechniqueToMax(player);
    await this.recalcCultivationEfficiency(player);
    await this.playerRepo.save(player);
    const def = await this.treasureService.findOne(Number(removed.id));
    this.logger.log(`玩家 ${playerId} 卸下槽位 ${slot} 的宝物 ${def?.name ?? removed.id}`);
    return { treasureId: Number(removed.id), itemId: def?.item_id ?? null };
  }

  /** 装配功法：标记 equipped，唯一装配，重算属性 */
  async equipTechnique(playerId: number, techniqueId: number): Promise<any> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw new NotFoundException('玩家不存在');
    const arr = this.parseTechnique(player.technique);
    if (!arr.find((t) => Number(t.id) === Number(techniqueId))) {
      throw new BadRequestException('尚未习得该功法');
    }
    arr.forEach((t) => { t.equipped = Number(t.id) === Number(techniqueId); });
    player.technique = JSON.stringify(arr);
    await this.applyEquippedTechniqueToMax(player);
    await this.playerRepo.save(player);
    return this.findOne(playerId);
  }

  /** 卸下功法：全部取消装配，重算属性 */
  async unequipTechnique(playerId: number): Promise<any> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw new NotFoundException('玩家不存在');
    const arr = this.parseTechnique(player.technique);
    arr.forEach((t) => { t.equipped = false; });
    player.technique = JSON.stringify(arr);
    await this.applyEquippedTechniqueToMax(player);
    await this.playerRepo.save(player);
    return this.findOne(playerId);
  }

  /** 读取某项功法的修炼进度（供修炼室渲染/校验）：{name, level, cultivation, max_cultivation, breakthrough_rate} */
  async getTechniqueState(playerId: number, techniqueId: number): Promise<{
    name: string; level: number; cultivation: number; max_cultivation: number; breakthrough_rate: number;
  } | null> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) return null;
    const arr = this.parseTechnique(player.technique);
    const entry = arr.find((t) => Number(t.id) === Number(techniqueId));
    const def = await this.techniqueService.findOne(techniqueId);
    if (!entry || !def) return null;
    const lv = Number(entry.level) || 1;
    return {
      name: def.name,
      level: lv,
      cultivation: Number(entry.cultivation) || 0,
      max_cultivation: this.techniqueService.maxCultivationAtLevel(def, lv),
      breakthrough_rate: techniqueBreakthroughBaseRate(def.rank),
    };
  }

  /**
   * 修炼功法（修炼室 technique 模式每跳调用）：与修炼斗气同公式（qi*factor*growth/100，含暴击/上限），
   * 但产出加到指定功法的修为上；满 max_cultivation 则截断并标记 full（功法突破暂未实现，故只填满）。
   */
  async cultivateTechnique(playerId: number, techniqueId: number, qiDensity: number): Promise<{
    gained: number; critical: boolean; cultivation: number; max_cultivation: number; full: boolean;
  }> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw new NotFoundException('玩家不存在');
    const arr = this.parseTechnique(player.technique);
    const entry = arr.find((t) => Number(t.id) === Number(techniqueId));
    if (!entry) throw new BadRequestException('未习得该功法');
    const def = await this.techniqueService.findOne(techniqueId);
    const lv = Number(entry.level) || 1;
    const max = def ? this.techniqueService.maxCultivationAtLevel(def, lv) : 0;
    const cur = Number(entry.cultivation) || 0;

    if (max > 0 && cur >= max) {
      return { gained: 0, critical: false, cultivation: cur, max_cultivation: max, full: true };
    }

    const growth = def?.growth ?? 10;
    const factor = 0.9 + Math.random() * 0.2;
    let gained = Math.round(qiDensity * factor * growth / 100);
    // 修炼效率：每点 +1% 修炼收益（来源于已装备宝物）
    const cultEff = (await this.sumEquippedTreasureEffects(player)).cultivation_efficiency || 0;
    if (cultEff > 0) gained = Math.round(gained * (100 + cultEff) / 100);
    const critical = Math.random() < 0.1;
    if (critical) gained *= 3;

    let newCult = cur + gained;
    const full = max > 0 && newCult >= max;
    if (full) { gained = max - cur; newCult = max; }

    entry.cultivation = newCult;
    player.technique = JSON.stringify(arr);
    await this.playerRepo.save(player);
    this.logger.log(`玩家 ${playerId} 修炼功法 ${techniqueId}：+${gained} 功法修为`);
    return { gained, critical, cultivation: newCult, max_cultivation: max, full };
  }

  /** 读取某项斗技的修炼进度（供修炼室渲染/校验）：{name, level, cultivation, max_cultivation, max_level} */
  async getSkillState(playerId: number, skillId: number): Promise<{
    name: string; level: number; cultivation: number; max_cultivation: number; max_level: number;
  } | null> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) return null;
    const arr = this.parseSkill(player.skill);
    const entry = arr.find((s) => Number(s.id) === Number(skillId));
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

  /**
   * 修炼斗技（修炼室 skill 模式每跳调用）：与修炼功法同公式，产出加到指定斗技修为上。
   * 与功法的区别：修为满后【自动突破】（等级+1、修为清零），无需玩家手动操作；
   * 因此可一直修炼，直至该斗技达到 max_level（返回 maxed=true 让修炼室结束会话）。
   */
  async cultivateSkill(playerId: number, skillId: number, qiDensity: number): Promise<{
    gained: number; critical: boolean; level: number; cultivation: number;
    max_cultivation: number; maxed: boolean; leveledUp: boolean;
  }> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw new NotFoundException('玩家不存在');
    const arr = this.parseSkill(player.skill);
    const entry = arr.find((s) => Number(s.id) === Number(skillId));
    if (!entry) throw new BadRequestException('未习得该斗技');
    const def = await this.skillService.findOne(skillId);
    if (!def) throw new NotFoundException('斗技不存在');

    let lv = Number(entry.level) || 1;
    const maxLevel = def.max_level ?? 0;
    // 已达最高级：不再增长
    if (maxLevel > 0 && lv >= maxLevel) {
      return { gained: 0, critical: false, level: lv, cultivation: Number(entry.cultivation) || 0, max_cultivation: 0, maxed: true, leveledUp: false };
    }

    const max = this.skillService.maxCultivationAtLevel(def, lv);
    const cur = Number(entry.cultivation) || 0;
    const growth = 10; // 斗技修炼速率（固定；功法走 def.growth，斗技无 growth 字段）
    const factor = 0.9 + Math.random() * 0.2;
    let gained = Math.round(qiDensity * factor * growth / 100);
    // 修炼效率：每点 +1% 修炼收益（来源于已装备宝物）
    const cultEff = (await this.sumEquippedTreasureEffects(player)).cultivation_efficiency || 0;
    if (cultEff > 0) gained = Math.round(gained * (100 + cultEff) / 100);
    const critical = Math.random() < 0.1;
    if (critical) gained *= 3;

    let newCult = cur + gained;
    let leveledUp = false;
    // 修为满 → 自动突破：等级+1、修为清零（多余修为不保留），可继续修炼下一级
    if (max > 0 && newCult >= max) {
      lv += 1;
      newCult = 0;
      leveledUp = true;
    }
    entry.level = lv;
    entry.cultivation = newCult;
    player.skill = JSON.stringify(arr);
    await this.playerRepo.save(player);

    const maxed = maxLevel > 0 && lv >= maxLevel;
    this.logger.log(`玩家 ${playerId} 修炼斗技 ${skillId}：+${gained} 修为${leveledUp ? `，自动突破至 Lv.${lv}` : ''}${maxed ? '，已满级' : ''}`);
    return { gained, critical, level: lv, cultivation: newCult, max_cultivation: this.skillService.maxCultivationAtLevel(def, lv), maxed, leveledUp };
  }

  /**
   * 功法突破：由前端小游戏汇总一个成功率 rate(%)，后端按规则判定成功与否并结算。
   * - 成功：等级+1（不超过 max_level）、修为清零；若该功法已装配，按新等级重算生命/斗气上限。
   * - 失败：修为保持满（可再次挑战），不变等级。
   * 返回最新玩家数据 + 突破结果（含叙事）。
   */
  async breakthroughTechnique(
    playerId: number,
    techniqueId: number,
    rate: number,
  ): Promise<any> {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw new NotFoundException('玩家不存在');
    const arr = this.parseTechnique(player.technique);
    const entry = arr.find((t) => Number(t.id) === Number(techniqueId));
    if (!entry) throw new BadRequestException('未习得该功法');
    const def = await this.techniqueService.findOne(techniqueId);
    if (!def) throw new NotFoundException('功法不存在');

    const lv = Number(entry.level) || 1;
    const max = this.techniqueService.maxCultivationAtLevel(def, lv);
    if (!(max > 0 && Number(entry.cultivation) >= max)) {
      throw new BadRequestException('功法修为未满，无法突破');
    }
    if (def.max_level && lv >= def.max_level) {
      throw new BadRequestException('功法已达最高境界');
    }

    const clampedRate = Math.max(0, Math.min(100, Number(rate) || 0));
    const success = clampedRate >= 100 ? true : Math.random() * 100 < clampedRate;

    let newLevel = lv;
    let narrative: string;
    if (success) {
      newLevel = def.max_level ? Math.min(lv + 1, def.max_level) : lv + 1;
      entry.level = newLevel;
      entry.cultivation = 0;
      player.technique = JSON.stringify(arr); // 先持久化新等级，便于按新等级重算上限
      if (!!entry.equipped) {
        await this.applyEquippedTechniqueToMax(player); // 重算 max_hp/max_energy
      }
      narrative = `你心神沉入《${def.name}》的功法意境，于斩魔证道间豁然贯通，成功将其参悟至第 ${newLevel} 重！`;
      this.logger.log(`玩家 ${playerId} 功法 ${techniqueId} 突破成功 -> Lv.${newLevel}`);
    } else {
      narrative = `你试图参悟《${def.name}》更深一层的奥义，却被心魔所扰，功亏一篑，尚需再行静修。`;
      this.logger.log(`玩家 ${playerId} 功法 ${techniqueId} 突破失败 (rate=${clampedRate})`);
    }
    player.technique = JSON.stringify(arr);
    await this.playerRepo.save(player);

    const fresh = await this.findOne(playerId);
    return {
      player: fresh,
      breakthrough: { success, narrative, level: newLevel, techniqueId, techniqueName: def.name },
    };
  }

  /** 原始查询（不含 technique 关联） */
  async findByIdRaw(id: number): Promise<Player | null> {
    return this.playerRepo.findOneBy({ id });
  }

  async findAll(): Promise<Player[]> {
    return this.playerRepo.find();
  }

  async setStatus(id: number, status: number): Promise<void> {
    await this.playerRepo.update(id, { status: status as any });
  }

  async patch(id: number, updates: Record<string, any>): Promise<void> {
    await this.playerRepo.update(id, updates as any);
  }

  /** 原子加金币（任务奖励/出售等统一入口，取代跨表原生 SQL） */
  async grantMoney(id: number, amount: number): Promise<void> {
    if (!amount) return;
    await this.playerRepo.increment({ id }, 'money', amount);
  }

  async update(id: number, updates: Partial<CreatePlayerDto>): Promise<Player | null> {
    await this.playerRepo.update(id, updates);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.playerRepo.delete(id);
  }

  async updatePosition(id: number, position: string): Promise<void> {
    const player = await this.playerRepo.findOneBy({ id });
    if (!player) throw new Error('玩家不存在');
    if (player.status === 2) throw new BadRequestException('历练中，无法移动');
    if (player.status === 5) throw new BadRequestException('室内修炼中，无法移动');
    await this.playerRepo.update(id, { position: position as any });
  }

  /** 修炼 */
  async cultivate(id: number, qiDensity: number): Promise<{
    cultivation: number; gained: number; critical: boolean; capped: boolean;
    level_cultivation: number; newCultivation: number;
  }> {
    const player = await this.playerRepo.findOneBy({ id });
    if (!player) throw new Error('玩家不存在');

    const equipped = this.getEquippedEntry(player);
    const tech = equipped ? await this.techniqueService.findOne(equipped.id) : null;
    const growth = tech?.growth ?? 10;
    const lc = player.level_cultivation;

    // 已达上限
    if (player.cultivation >= lc) {
      return { cultivation: player.cultivation, gained: 0, critical: false, capped: true, level_cultivation: lc, newCultivation: player.cultivation };
    }

    const factor = 0.9 + Math.random() * 0.2;
    let gained = Math.round(qiDensity * factor * growth / 100);

    // 修炼效率：每点 +1% 修炼收益（来源于已装备宝物，如玄铁戒指 +5）
    const cultEff = (await this.sumEquippedTreasureEffects(player)).cultivation_efficiency || 0;
    if (cultEff > 0) gained = Math.round(gained * (100 + cultEff) / 100);

    // 暴击：10% 概率三倍
    const critical = Math.random() < 0.1;
    if (critical) gained *= 3;

    // 上限截断
    let newCultivation = player.cultivation + gained;
    const capped = newCultivation > lc;
    if (capped) { gained = lc - player.cultivation; newCultivation = lc; }

    await this.playerRepo.update(id, { cultivation: newCultivation as any });

    this.logger.log(`玩家 ${id} 修炼：+${gained} 修为 (斗气=${qiDensity}, growth=${growth}${critical ? ', 暴击x3' : ''}${capped ? ', 已达上限' : ''})`);
    return { cultivation: player.cultivation, gained, critical, capped, level_cultivation: lc, newCultivation };
  }

  /** 等级名称 */
  static levelName(level: number): string {
    if (level <= 9) return '斗之气 ' + '一二三四五六七八九'[level - 1] + '段';
    if (level <= 19) return '斗者 ' + '一二三四五六七八九'[level - 11] + '星';
    if (level <= 29) return '斗师 ' + '一二三四五六七八九'[level - 21] + '星';
    return '大斗师 ' + '一二三四五六七八九'[level - 31] + '星';
  }

  /** 突破成功率 K% */
  static breakthroughRate(level: number): number {
    if (level >= 21) return 60;
    if (level >= 11) return 70;
    return 80;
  }

  /** 突破 */
  async breakthrough(id: number): Promise<{
    success: boolean; narrative: string; newLevel: number; newCultivation: number;
    level_cultivation: number; levelName: string; oldLevel: number; gained: number;
  }> {
    const player = await this.playerRepo.findOneBy({ id });
    if (!player) throw new Error('玩家不存在');
    const lc = player.level_cultivation;
    if (player.cultivation < lc) throw new Error('修为不足，无法突破');

    const K = PlayerService.breakthroughRate(player.level);
    const bonus = Number(player.breakthrough_bonus) || 0;
    const effK = Math.min(95, K + bonus);
    const success = Math.random() * 100 < effK;
    const equipped = this.getEquippedEntry(player);
    const tech = equipped ? await this.techniqueService.findOne(equipped.id) : null;
    const oldLevel = player.level;
    const oldName = PlayerService.levelName(oldLevel);

    let newLevel = player.level;
    let newCultivation = player.cultivation;
    let gained = 0;

    if (success) {
      newLevel = player.level + 1;
      newCultivation = 0;
      gained = 1;
    } else {
      newCultivation = Math.floor(player.cultivation * 0.5);
    }

    const newLc = calcLevelCultivation(newLevel);
    const newName = PlayerService.levelName(newLevel);
    const techBase = tech ? this.techniqueService.parseBase(tech.base, equipped?.level ?? 1) : {};

    let maxHp = player.max_hp;
    let maxEnergy = player.max_energy;
    // 突破成功：按新等级重算「等级属性」（基础 + levelAttrBonus），并据此重算生命上限、回满生命斗气。
    // 属性成长规则只与等级有关，这里只是把它同步到新等级，不在事件里硬写 +3。
    let attrUpdate: { power: number; intelligence: number; quick: number; stamina: number; lucky: number } | undefined;
    if (success) {
      const bonus = levelAttrBonus(newLevel);
      attrUpdate = {
        power: player.base_power + bonus,
        intelligence: player.base_intelligence + bonus,
        quick: player.base_quick + bonus,
        stamina: player.base_stamina + bonus,
        lucky: player.base_lucky + bonus,
      };
      const finalStamina = attrUpdate.stamina + (techBase.stamina || 0);
      maxHp = finalStamina * 10 + (techBase.hp || 0);
      maxEnergy = newLevel * 20 + (techBase.energy || 0);
    }

    await this.playerRepo.update(id, {
      level: newLevel as any,
      cultivation: newCultivation as any,
      level_cultivation: newLc as any,
      max_hp: maxHp as any,
      max_energy: maxEnergy as any,
      hp: success ? maxHp : (player.hp as any),
      energy: success ? maxEnergy : (player.energy as any),
      breakthrough_bonus: 0 as any,
      ...(attrUpdate as any),
    });

    // 调用 agent 生成叙事
    let narrative = '';
    try {
      const data = await this.agentClient.generateBreakthrough({
        player: { name: player.name, level: oldLevel, level_name: success ? newName : oldName, technique_name: tech?.name || '' },
        success,
        location: { name: '' },
      });
      narrative = data?.text || '';
    } catch {
      narrative = success ? '你感到体内斗气翻涌，成功突破了修炼瓶颈！' : '你冲击瓶颈失败，体内斗气紊乱，修为受损。';
    }

    this.logger.log('玩家 ' + id + ' 突破：' + (success ? '成功' : '失败') + ' ' + oldName + ' -> ' + newName);
    return { success, narrative, newLevel, newCultivation, level_cultivation: newLc, levelName: newName, oldLevel, gained };
  }

}
