import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DungeonInstance } from './dungeon_instance.entity';
import { PlayerService } from '../player/player.service';
import { BackpackService } from '../backpack/backpack.service';
import { ItemUseService } from '../item/item-use.service';
import { MobService } from '../mob/mob.service';
import { ItemService } from '../item/item.service';
import { Mob } from '../mob/mob.entity';
import { AgentClient } from '../agent/agent.client';
import { EncounterService } from '../encounter/encounter.service';

const SCENE_POOL = ['山洞', '密林', '山谷', '浅滩'];

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch { return fallback; }
}

/** 难度 → 事件锚点配置（难度决定副本内魔兽/物品的等阶） */
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

@Injectable()
export class DungeonService {
  private readonly logger = new Logger(DungeonService.name);

  constructor(
    @InjectRepository(DungeonInstance)
    private readonly repo: Repository<DungeonInstance>,
    private readonly playerService: PlayerService,
    private readonly backpackService: BackpackService,
    private readonly itemUseService: ItemUseService,
    private readonly agentClient: AgentClient,
    private readonly mobService: MobService,
    private readonly itemService: ItemService,
    private readonly encounterService: EncounterService,
  ) {}

  /** 进入副本：生成蓝图并创建实例（旧进行中副本自动标记为放弃） */
  async enter(playerId: number, encounterId?: number): Promise<DungeonInstance> {
    const player = await this.playerService.findOne(playerId);
    if (!player) throw new NotFoundException('玩家不存在');
    if (player.status !== 1) throw new Error('正在进行别的事物，请完成后再尝试进入');

    await this.repo.update({ player_id: playerId, status: 'active' }, { status: 'escaped' });

    // 场景类型：由奇遇进入则消耗奇遇并取其 scene_type，否则随机
    let sceneType = SCENE_POOL[Math.floor(Math.random() * SCENE_POOL.length)];
    let encounterRefId: number | null = null;
    if (encounterId) {
      const enc = await this.encounterService.consume(encounterId, playerId);
      if (enc) { sceneType = enc.scene_type; encounterRefId = enc.id; }
    }
    // 难度锚点：暂时写死 1 星；后续接入地图等阶后，由当前历练地图 danger_level/region 决定
    const difficulty = 1;
    const blueprint = await this.generateBlueprint(sceneType, player.level, difficulty);

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
    await this.playerService.setStatus(playerId, 3);
    return this.enrich(saved);
  }

  /** 获取玩家当前进行中的副本（原始数据，内部用） */
  async getCurrent(playerId: number): Promise<DungeonInstance | null> {
    return this.repo.findOne({
      where: { player_id: playerId, status: 'active' },
      order: { created_at: 'DESC' },
    });
  }

  /** 推进下一幕；若已在最后一幕则通关（临时背包转入主背包） */
  async next(playerId: number): Promise<any> {
    const inst = await this.getCurrent(playerId);
    if (!inst) throw new NotFoundException('没有进行中的副本');
    const total = Array.isArray(inst.acts) ? inst.acts.length : 5;
    if (inst.current_act >= total) {
      inst.status = 'completed';
      await this.flushTempToBackpack(playerId, inst);
      if (inst.encounter_id) await this.encounterService.markDone(inst.encounter_id, playerId);
      await this.playerService.setStatus(playerId, 1);
    } else {
      inst.current_act += 1;
    }
    return this.enrich(await this.repo.save(inst));
  }

  /** 撤退：放弃副本，临时背包丢失 */
  async escape(playerId: number): Promise<any> {
    const inst = await this.getCurrent(playerId);
    if (!inst) throw new NotFoundException('没有进行中的副本');
    inst.status = 'escaped';
    inst.temp_items = '[]';
    await this.repo.save(inst);
    if (inst.encounter_id) await this.encounterService.markDone(inst.encounter_id, playerId);
    await this.playerService.setStatus(playerId, 1);
    return this.enrich(inst);
  }

  /** 战斗失败：放弃副本，临时背包丢失 */
  async fail(playerId: number): Promise<any> {
    const inst = await this.getCurrent(playerId);
    if (!inst) throw new NotFoundException('没有进行中的副本');
    inst.status = 'failed';
    inst.temp_items = '[]';
    await this.repo.save(inst);
    if (inst.encounter_id) await this.encounterService.markDone(inst.encounter_id, playerId);
    await this.playerService.setStatus(playerId, 1);
    return this.enrich(inst);
  }

  /** 战斗胜利掉落：按当前幕魔兽数据掷骰掉落，进入副本临时背包（幂等，已掉落则跳过） */
  async loot(playerId: number): Promise<any> {
    const inst = await this.getCurrent(playerId);
    if (!inst) throw new NotFoundException('没有进行中的副本');
    const acts = Array.isArray(inst.acts) ? inst.acts : [];
    const act = acts[inst.current_act - 1];
    if (!act || (act.type !== 'combat' && act.type !== 'boss') || act.looted) {
      return this.enrich(inst);
    }
    const mobId = act.mob?.mob_id;
    const mob = mobId ? await this.mobService.findByMobId(mobId) : null;
    const drops = mob ? await this.calcDrops(mob.drops) : [];
    const temp = parseJson<any[]>(inst.temp_items, []);
    const lootNames: string[] = [];
    for (const d of drops) {
      if (!d || !d.name) continue;
      const cnt = Number(d.count) || 1;
      const ex = temp.find((t) => t.name === d.name);
      if (ex) ex.count += cnt;
      else temp.push({ name: d.name, count: cnt });
      lootNames.push(`${d.name} ×${cnt}`);
    }
    inst.temp_items = JSON.stringify(temp);
    act.looted = true;
    act.lootNames = lootNames;
    inst.acts = acts;
    return this.enrich(await this.repo.save(inst));
  }

  /** 拾取当前物品幕奖励（进入副本临时背包，重复拾取返回已拾取） */
  async pick(playerId: number): Promise<any> {
    const inst = await this.getCurrent(playerId);
    if (!inst) throw new NotFoundException('没有进行中的副本');
    const acts = Array.isArray(inst.acts) ? inst.acts : [];
    const act = acts[inst.current_act - 1];
    if (!act || act.type !== 'item') throw new NotFoundException('当前幕不是物品事件');
    if (act.picked) return this.enrich(inst);

    const reward: any[] = Array.isArray(act.reward) ? act.reward : [];
    const temp = parseJson<any[]>(inst.temp_items, []);
    for (const r of reward) {
      if (!r || !r.name) continue;
      const cnt = Number(r.count) || 1;
      const ex = temp.find((t) => t.name === r.name);
      if (ex) ex.count += cnt;
      else temp.push({ name: r.name, count: cnt });
    }
    inst.temp_items = JSON.stringify(temp);
    act.picked = true;
    act.reveal = `已获取 ${reward.map((r) => `${r.name} ×${r.count}`).join('、')}`;
    inst.acts = acts;
    return this.enrich(await this.repo.save(inst));
  }

  /** 使用副本临时背包中的物品（效果同主背包，仅扣减来源不同） */
  async useTempItem(playerId: number, name: string): Promise<any> {
    const inst = await this.getCurrent(playerId);
    if (!inst) throw new NotFoundException('没有进行中的副本');
    const temp = parseJson<any[]>(inst.temp_items, []);
    const slot = temp.find((t) => t.name === name);
    if (!slot || slot.count <= 0) return { error: '临时背包没有该物品' };

    const outcome = await this.itemUseService.applyUseEffect(playerId, name);
    if (!outcome.ok) return { error: outcome.error };

    slot.count -= 1;
    if (slot.count <= 0) {
      const idx = temp.findIndex((t) => t.name === name);
      if (idx >= 0) temp.splice(idx, 1);
    }
    inst.temp_items = JSON.stringify(temp);
    const enriched = await this.enrich(await this.repo.save(inst));
    return { used: { name, message: outcome.message }, player: outcome.player, instance: enriched };
  }

  /** 通关：把临时背包全部转入玩家主背包，并清空 */
  private async flushTempToBackpack(playerId: number, inst: DungeonInstance): Promise<void> {
    const temp = parseJson<any[]>(inst.temp_items, []);
    for (const t of temp) {
      if (t && t.name) await this.backpackService.addItem(playerId, t.name, Number(t.count) || 1);
    }
    inst.temp_items = '[]';
  }

  /** 返回给前端的视图：temp_items 解析为数组并附带 usable 标记 */
  async enrich(inst: DungeonInstance | null): Promise<any> {
    if (!inst) return inst;
    const temp = parseJson<any[]>(inst.temp_items, []);
    const names = temp.map((t) => t.name).filter(Boolean);
    let usableMap = new Map<string, boolean>();
    if (names.length) {
      const rows = await this.itemService.findByNames(names);
      usableMap = new Map(rows.map((i) => [i.name, !!i.usable]));
    }
    return { ...inst, temp_items: temp.map((t) => ({ ...t, usable: usableMap.get(t.name) || false })) };
  }

  /** 按 mob.drops 配置掷骰掉落，复用历练的掉落算法（结果进副本临时背包） */
  private async calcDrops(dropsJson: string | null | undefined): Promise<{ item_id: string; name: string; count: number }[]> {
    if (!dropsJson) return [];
    let dropDefs: { item_id: string; name: string; rate: number; min: number; max: number }[];
    try { dropDefs = JSON.parse(dropsJson); } catch { return []; }
    if (!Array.isArray(dropDefs) || !dropDefs.length) return [];
    const ids = [...new Set(dropDefs.map((d) => d.item_id).filter(Boolean))];
    const items = ids.length ? await this.itemService.findByItemIds(ids) : [];
    const itemMap = new Map(items.map((it) => [it.item_id, it]));
    const result: { item_id: string; name: string; count: number }[] = [];
    for (const d of dropDefs) {
      if (Math.random() <= (d.rate ?? 0)) {
        const min = Number(d.min) || 1;
        const max = Number(d.max) || min;
        const count = Math.floor(Math.random() * (max - min + 1)) + min;
        const cleanName = itemMap.get(d.item_id)?.name || d.name;
        result.push({ item_id: d.item_id, name: cleanName, count });
      }
    }
    return result;
  }

  private async generateBlueprint(sceneType: string, playerLevel: number, difficulty: number): Promise<DungeonBlueprint> {
    let blueprint: DungeonBlueprint;
    try {
      const data = await this.agentClient.generateDungeon({
        scene_type: sceneType,
        player_level: playerLevel,
        difficulty,
      });
      const acts = Array.isArray(data.acts)
        ? data.acts.slice(0, 5).map((a: any, i: number) => ({
            index: i + 1,
            type: String(a.type || 'combat'),
            title: String(a.title || `第${i + 1}幕`),
            narrative: String(a.narrative || ''),
          }))
        : [];
      if (acts.length < 5) throw new Error('幕数不足');
      blueprint = {
        title: String(data.title || `${sceneType}秘境`),
        scene_type: String(data.scene_type || sceneType),
        intro: String(data.intro || ''),
        acts,
      };
    } catch (err) {
      this.logger.error(`副本蓝图生成失败: ${(err as Error).message}，使用降级方案`);
      blueprint = this.fallbackBlueprint(sceneType, difficulty);
    }

    // 难度锚点：为各幕挂载对应等阶的魔兽数据 / 魔核奖励
    return this.enrichActs(blueprint, difficulty);
  }

  /** 按难度给 combat/boss 幕挂魔兽数据，给 item 幕挂魔核奖励 */
  private async enrichActs(bp: DungeonBlueprint, difficulty: number): Promise<DungeonBlueprint> {
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
  private async pickMob(lvMin: number, lvMax: number, boss: boolean): Promise<Mob | null> {
    const mobs = await this.mobService.findWBByLevelRange(lvMin, lvMax, boss ? 'DESC' : 'ASC');
    if (!mobs.length) return null;
    if (boss) return mobs[0];
    return mobs[Math.floor(Math.random() * mobs.length)];
  }

  /** 从指定等阶魔核中随机抽一个，数量 1-3 */
  private async pickCoreReward(keyword: string): Promise<{ item_id: string; name: string; count: number; price: number } | null> {
    const cores = await this.itemService.findByTypeAndNameKeyword('魔核', keyword);
    if (!cores.length) return null;
    const c = cores[Math.floor(Math.random() * cores.length)];
    return { item_id: c.item_id, name: c.name, count: 1 + Math.floor(Math.random() * 3), price: c.price };
  }

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
