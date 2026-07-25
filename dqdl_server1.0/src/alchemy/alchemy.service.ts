import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PillRecipe } from './pill-recipe.entity';
import { Item } from '../item/item.entity';
import { ItemService } from '../item/item.service';
import { PlayerService } from '../player/player.service';
import { BackpackService } from '../backpack/backpack.service';
import { Biz } from '../common/biz.exception';

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch { return fallback; }
}

export interface CraftResult {
  success: boolean;
  reason: string;
  output: { name: string; count: number; item_id: string } | null;
  totals: Record<string, number>;
  required: Record<string, number>;
  tolerance: Record<string, number>;
  furnace: { name: string; tier: number; cap: number; durability: number } | null;
}

/**
 * 炼丹服务（移植自老版本 dqdl-server/src/alchemy/alchemy.service.ts）。
 * 适配 1.0：backpack 按 item_id 操作（非 name）；player 用 getEntity/patch/grantMoney。
 *
 * 核心算法 attempt：元素能量求和 → 公差判定 → 杂质比例掷骰 → 成败结算。
 */
@Injectable()
export class AlchemyService {
  private readonly logger = new Logger(AlchemyService.name);

  constructor(
    @InjectRepository(PillRecipe)
    private readonly recipeRepo: Repository<PillRecipe>,
    private readonly itemService: ItemService,
    private readonly playerService: PlayerService,
    private readonly backpackService: BackpackService,
  ) {}

  /** 丹方列表（标注已学习）—— 首次访问触发懒授予丹炉+入门丹方 */
  async listRecipes(playerId: number) {
    await this.ensureFurnace(playerId);
    const player = await this.playerService.getEntity(playerId);
    const learned = new Set(parseJson<string[]>(player?.recipes || '[]', []));
    const recipes = await this.recipeRepo.find({ order: { tier: 'ASC', id: 'ASC' } });
    return recipes.map((r) => ({
      recipe_id: r.recipe_id,
      name: r.name,
      tier: r.tier,
      output_item_id: r.output_item_id,
      required: parseJson(r.required, {}),
      tolerance: parseJson(r.tolerance, {}),
      min_furnace_tier: r.min_furnace_tier,
      price: r.price,
      learned: learned.has(r.recipe_id),
    }));
  }

  /** 学习丹方（扣金币 + 写入 player.recipes） */
  async learnRecipe(playerId: number, recipeId: string) {
    const recipe = await this.recipeRepo.findOneBy({ recipe_id: recipeId });
    if (!recipe) throw Biz.notFound('丹方不存在');
    const player = await this.playerService.getEntity(playerId);
    if (!player) throw Biz.notFound('玩家不存在');
    const learned = parseJson<string[]>(player.recipes || '[]', []);
    if (learned.includes(recipeId)) return { ok: true, message: '已学会该丹方', learned: true };
    const cost = recipe.price || 0;
    if ((player.money ?? 0) < cost) throw Biz.badRequest('金币不足');
    await this.playerService.grantMoney(playerId, -cost);
    learned.push(recipeId);
    await this.playerService.patch(playerId, { recipes: JSON.stringify(learned) } as any);
    return { ok: true, message: `学会 ${recipe.name}`, learned: true, money: (player.money ?? 0) - cost };
  }

  /** 玩家背包里的丹炉列表 */
  async listFurnaces(playerId: number) {
    const slots = await this.backpackService.listByPlayer(playerId);
    const furnaceSlots = slots.filter((s) => s.item?.type === '丹炉');
    const player = await this.playerService.getEntity(playerId);
    return {
      equipped: player?.equipped_furnace ?? null,
      durability: player?.furnace_durability ?? 0,
      furnaces: furnaceSlots.map((s) => ({
        item_id: s.item_id,
        name: s.item?.name || s.item_id,
        spec: parseJson(s.item?.furnace_spec ?? null, { tier: 1, slots: 4, cap: 100, max_durability: 50 }),
        count: s.count,
      })),
    };
  }

  /** 装备丹炉 */
  async equipFurnace(playerId: number, itemId: string) {
    const item = await this.itemService.findByItemId(itemId);
    if (!item || item.type !== '丹炉') throw Biz.badRequest('不是丹炉');
    const spec = parseJson<any>(item.furnace_spec, { max_durability: 50 });
    await this.playerService.patch(playerId, {
      equipped_furnace: itemId,
      furnace_durability: spec.max_durability ?? 50,
    } as any);
    return { ok: true, equipped: itemId, durability: spec.max_durability ?? 50 };
  }

  /** 确保玩家有丹炉：若无则懒授予黄阶丹炉 + 入门丹方 */
  async ensureFurnace(playerId: number) {
    const player = await this.playerService.getEntity(playerId);
    if (!player) throw Biz.notFound('玩家不存在');
    if (player.equipped_furnace) {
      const f = await this.itemService.findByItemId(player.equipped_furnace);
      if (f) return f;
    }
    const furnace = await this.itemService.findByItemId('dl-1');
    if (!furnace) throw new Error('黄阶丹炉未入库');
    const spec = parseJson<any>(furnace.furnace_spec, { max_durability: 50 });
    await this.playerService.patch(playerId, {
      equipped_furnace: 'dl-1',
      furnace_durability: spec.max_durability ?? 50,
    } as any);
    await this.backpackService.addItem(playerId, 'dl-1', 1, 'ensureFurnace');
    const learned = parseJson<string[]>(player.recipes || '[]', []);
    const starters = ['pf-001', 'pf-002', 'pf-003', 'pf-004', 'pf-005'];
    let changed = false;
    for (const s of starters) {
      if (!learned.includes(s)) { learned.push(s); changed = true; }
    }
    if (changed) await this.playerService.patch(playerId, { recipes: JSON.stringify(learned) } as any);
    this.logger.log(`玩家 ${playerId} 懒授予黄阶丹炉 + 入门丹方`);
    return furnace;
  }

  /** 可炼丹材料目录 */
  async getMaterialCatalog() {
    const all = await this.itemService.findAll();
    return all
      .filter((i) => i.element_energy)
      .map((i) => ({
        item_id: i.item_id,
        name: i.name,
        type: i.type,
        alchemy_tier: i.alchemy_tier || 0,
        element_energy: parseJson<Record<string, number>>(i.element_energy, {}),
      }));
  }

  /** 丹房商店 */
  async getShop() {
    const all = await this.itemService.findAll();
    const herbs = all
      .filter((i) => i.type === '草药' && i.alchemy_tier === 1)
      .map((i) => ({ item_id: i.item_id, name: i.name, price: i.price, element_energy: parseJson(i.element_energy, {}) }));
    const recipes = (await this.recipeRepo.find({ order: { tier: 'ASC', id: 'ASC' } })).map((r) => ({
      recipe_id: r.recipe_id, name: r.name, tier: r.tier, price: r.price,
    }));
    const furnaces = all
      .filter((i) => i.type === '丹炉')
      .map((i) => ({ item_id: i.item_id, name: i.name, price: i.price, spec: parseJson(i.furnace_spec, {}) }));
    return { herbs, recipes, furnaces };
  }

  /** 购买：recipe=学习丹方；item=草药/丹炉入背包 */
  async buy(playerId: number, kind: 'recipe' | 'item', id: string) {
    if (kind === 'recipe') return this.learnRecipe(playerId, id);
    const item = await this.itemService.findByItemId(id);
    if (!item) throw Biz.notFound('物品不存在');
    const player = await this.playerService.getEntity(playerId);
    if (!player) throw Biz.notFound('玩家不存在');
    const cost = item.price || 0;
    if ((player.money ?? 0) < cost) throw Biz.badRequest('金币不足');
    await this.playerService.grantMoney(playerId, -cost);
    await this.backpackService.addItem(playerId, id, 1, 'alchemy_buy');
    return { ok: true, message: `购入 ${item.name}`, money: (player.money ?? 0) - cost };
  }

  /**
   * 炼丹核心：投入材料 → 元素能量求和 → 公差匹配 → 成败。
   * 无论成败材料全部消耗（硬核）；失败扣丹炉耐久，归零报废。
   *
   * 适配 1.0：ingredients 按 item_id 传（不是 name）。
   */
  async attempt(playerId: number, recipeId: string, ingredients: Array<{ item_id: string; count: number }>): Promise<CraftResult> {
    const recipe = await this.recipeRepo.findOneBy({ recipe_id: recipeId });
    if (!recipe) throw Biz.notFound('丹方不存在');

    await this.ensureFurnace(playerId);
    const player = await this.playerService.getEntity(playerId);
    if (!player) throw Biz.notFound('玩家不存在');

    const learned = parseJson<string[]>(player.recipes || '[]', []);
    if (!learned.includes(recipeId)) throw Biz.badRequest('尚未学会该丹方');

    const furnaceItem = await this.itemService.findByItemId(player.equipped_furnace || 'dl-1');
    if (!furnaceItem) throw Biz.badRequest('未装备丹炉');
    const fSpec = parseJson<any>(furnaceItem.furnace_spec, { tier: 1, slots: 4, cap: 100 });
    const furnace = {
      name: furnaceItem.name,
      tier: Number(fSpec.tier) || 1,
      cap: Number(fSpec.cap) || 100,
      durability: player.furnace_durability ?? 0,
    };

    if (furnace.tier < recipe.min_furnace_tier)
      throw Biz.badRequest(`${furnaceItem.name}品阶不足，至少需要 ${recipe.min_furnace_tier} 阶丹炉`);

    const distinct = new Set(ingredients.map((i) => i.item_id));
    if (distinct.size > Number(fSpec.slots) || ingredients.length > Number(fSpec.slots))
      throw Biz.badRequest(`丹炉最多投放 ${fSpec.slots} 种材料`);
    if (ingredients.length === 0) throw Biz.badRequest('请至少投放一种材料');

    // 校验背包持有量（1.0 按 item_id）
    for (const ing of ingredients) {
      const owned = await this.backpackService.getCount(playerId, ing.item_id);
      if (owned < ing.count) throw Biz.badRequest(`材料 ${ing.item_id} 数量不足`);
    }

    const required = parseJson<Record<string, number>>(recipe.required, {});
    const tolerance = parseJson<Record<string, number>>(recipe.tolerance, {});

    // 取材料 item 定义，求元素能量总和（1.0 按 item_id 查）
    const itemIds = [...distinct];
    const dbItems = await this.itemService.findByItemIds(itemIds);
    const itemMap = new Map(dbItems.map((i) => [i.item_id, i]));
    const totals: Record<string, number> = {};
    for (const ing of ingredients) {
      const it = itemMap.get(ing.item_id);
      if (!it) throw Biz.badRequest(`未知材料 ${ing.item_id}`);
      const el = parseJson<Record<string, number>>(it.element_energy, {});
      for (const e of Object.keys(el)) {
        totals[e] = (totals[e] || 0) + (el[e] || 0) * ing.count;
      }
    }

    // 无论成败先消耗材料（1.0 按 item_id）
    for (const ing of ingredients) {
      await this.backpackService.removeItem(playerId, ing.item_id, ing.count, 'alchemy_attempt');
    }

    // 判定阶段一：硬约束
    let success = true;
    let reason = '';
    let rate = 1;

    for (const e of Object.keys(totals)) {
      if (totals[e] > furnace.cap) {
        success = false;
        reason = `${e}元素能量 ${totals[e]} 超出丹炉上限 ${furnace.cap}，炸炉！`;
        break;
      }
    }
    if (success) {
      for (const e of Object.keys(required)) {
        const need = required[e];
        const tol = tolerance[e] ?? 0;
        const got = totals[e] || 0;
        if (got < need - tol || got > need + tol) {
          success = false;
          reason = `${e}元素能量 ${got} 未落在 ${need - tol}~${need + tol} 区间，炼制失败`;
          break;
        }
      }
    }

    // 判定阶段二：杂质比例掷骰
    if (success) {
      const requiredKeys = new Set(Object.keys(required));
      let neededSum = 0;
      let impuritySum = 0;
      for (const e of Object.keys(totals)) {
        const v = totals[e];
        if (requiredKeys.has(e)) neededSum += v;
        else impuritySum += Math.abs(v);
      }
      const ratio = neededSum > 0 ? impuritySum / neededSum : (impuritySum > 0 ? 99 : 0);
      rate = ratio <= 1 ? 0.9 : 0.9 / ratio;
      const roll = Math.random();
      const note = `杂质比例 ${ratio.toFixed(2)}（成功率 ${(rate * 100).toFixed(0)}%）`;
      if (roll > rate) {
        success = false;
        reason = `${note}，本次炼制未能成丹`;
      } else {
        reason = note;
      }
    }

    // 结算
    let output: { name: string; count: number; item_id: string } | null = null;
    if (success) {
      const outItem = await this.itemService.findByItemId(recipe.output_item_id);
      const yield_ = recipe.base_yield || 1;
      if (outItem) {
        await this.backpackService.addItem(playerId, recipe.output_item_id, yield_, 'alchemy_success');
        output = { name: outItem.name, count: yield_, item_id: recipe.output_item_id };
        reason = `${reason}，获得 ${outItem.name} ×${yield_}`;
      }
    } else {
      const fresh = await this.playerService.getEntity(playerId);
      const newDur = (fresh?.furnace_durability ?? 1) - 1;
      if (newDur > 0) {
        await this.playerService.patch(playerId, { furnace_durability: newDur } as any);
        furnace.durability = newDur;
        reason += `（丹炉耐久 -1，剩余 ${newDur}）`;
      } else {
        await this.playerService.patch(playerId, { furnace_durability: 0, equipped_furnace: null } as any);
        furnace.durability = 0;
        reason += '（丹炉耐久耗尽，丹炉报废！）';
      }
    }

    return { success, reason, output, totals, required, tolerance, furnace };
  }
}
