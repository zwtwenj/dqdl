import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PillRecipe } from './pill-recipe.entity';
import { Item } from '../item/item.entity';
import { ItemService } from '../item/item.service';
import { PlayerService } from '../player/player.service';
import { BackpackService } from '../backpack/backpack.service';

const ELEMENTS = ['金', '木', '水', '火', '土', '雷', '风'];

interface IngredientInput {
  name: string;
  count: number;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export interface CraftResult {
  success: boolean;
  reason: string;
  output: { name: string; count: number } | null;
  totals: Record<string, number>;
  required: Record<string, number>;
  tolerance: Record<string, number>;
  furnace: { name: string; tier: number; cap: number; durability: number } | null;
}

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

  /** 丹方列表（标注是否已学习）—— 首次访问触发懒授予丹炉+入门丹方 */
  async listRecipes(playerId: number) {
    await this.ensureFurnace(playerId);
    const player = await this.playerService.findByIdRaw(playerId);
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
    if (!recipe) throw new NotFoundException('丹方不存在');
    const player = await this.playerService.findByIdRaw(playerId);
    if (!player) throw new NotFoundException('玩家不存在');
    const learned = parseJson<string[]>(player.recipes || '[]', []);
    if (learned.includes(recipeId)) return { ok: true, message: '已学会该丹方', learned: true };
    const cost = recipe.price || 0;
    if ((player.money ?? 0) < cost) throw new BadRequestException('金币不足');
    await this.playerService.grantMoney(playerId, -cost);
    learned.push(recipeId);
    await this.playerService.patch(playerId, { recipes: JSON.stringify(learned) });
    return { ok: true, message: `学会 ${recipe.name}`, learned: true, money: (player.money ?? 0) - cost };
  }

  /** 玩家背包里的丹炉列表 */
  async listFurnaces(playerId: number) {
    const bp = await this.backpackService.getByPlayer(playerId);
    const items = this.backpackService.parseItems(bp.items);
    const furnaceNames = items.filter((i) => i.count > 0).map((i) => i.name);
    const dbFurnaces = furnaceNames.length
      ? await this.itemService.findByNames(furnaceNames)
      : [];
    const furnaces = dbFurnaces.filter((i) => i.type === '丹炉');
    const player = await this.playerService.findByIdRaw(playerId);
    const equipped = player?.equipped_furnace || null;
    return {
      equipped,
      durability: player?.furnace_durability ?? 0,
      furnaces: furnaces.map((f) => ({
        item_id: f.item_id,
        name: f.name,
        spec: parseJson(f.furnace_spec, { tier: 1, slots: 4, cap: 100, max_durability: 50 }),
        count: items.find((i) => i.name === f.name)?.count ?? 0,
      })),
    };
  }

  /** 装备丹炉（从背包选一个丹炉作为当前使用） */
  async equipFurnace(playerId: number, itemId: string) {
    const item = await this.itemService.findByItemId(itemId);
    if (!item || item.type !== '丹炉') throw new BadRequestException('不是丹炉');
    const spec = parseJson(item.furnace_spec, { max_durability: 50 } as any);
    await this.playerService.patch(playerId, {
      equipped_furnace: itemId,
      furnace_durability: spec.max_durability ?? 50,
    });
    return { ok: true, equipped: itemId, durability: spec.max_durability ?? 50 };
  }

  /**
   * 确保玩家有丹炉：若无则懒授予一个黄阶丹炉（dl-1）+ 一阶入门丹方。
   * 同时把丹炉放入背包便于展示。
   */
  async ensureFurnace(playerId: number) {
    const player = await this.playerService.findByIdRaw(playerId);
    if (!player) throw new NotFoundException('玩家不存在');
    if (player.equipped_furnace) {
      const f = await this.itemService.findByItemId(player.equipped_furnace);
      if (f) return f;
    }
    // 懒授予黄阶丹炉
    const furnace = await this.itemService.findByItemId('dl-1');
    if (!furnace) throw new Error('黄阶丹炉未入库，请先运行 seed');
    const spec = parseJson<any>(furnace.furnace_spec, { max_durability: 50 });
    await this.playerService.patch(playerId, {
      equipped_furnace: 'dl-1',
      furnace_durability: spec.max_durability ?? 50,
    });
    await this.backpackService.addItem(playerId, furnace.name, 1);
    // 赠送一阶入门丹方
    const learned = parseJson<string[]>(player.recipes || '[]', []);
    const starters = ['pf-001', 'pf-002', 'pf-003', 'pf-004', 'pf-005'];
    let changed = false;
    for (const s of starters) {
      if (!learned.includes(s)) {
        learned.push(s);
        changed = true;
      }
    }
    if (changed) await this.playerService.patch(playerId, { recipes: JSON.stringify(learned) });
    this.logger.log(`玩家 ${playerId} 懒授予黄阶丹炉 + 入门丹方`);
    return furnace;
  }

  /** 可炼丹材料目录（所有带 element_energy 的物品：草药/材料/魔核） */
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

  /** 丹房商店：可购草药 / 丹方 / 丹炉 */
  async getShop() {    const all = await this.itemService.findAll();
    const herbs = all
      .filter((i) => i.type === '草药' && i.alchemy_tier === 1)
      .map((i) => ({ item_id: i.item_id, name: i.name, price: i.price, element_energy: parseJson(i.element_energy, {}) }));
    const recipes = (await this.recipeRepo.find({ order: { tier: 'ASC', id: 'ASC' } })).map((r) => ({
      recipe_id: r.recipe_id,
      name: r.name,
      tier: r.tier,
      price: r.price,
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
    if (!item) throw new NotFoundException('物品不存在');
    const player = await this.playerService.findByIdRaw(playerId);
    if (!player) throw new NotFoundException('玩家不存在');
    const cost = item.price || 0;
    if ((player.money ?? 0) < cost) throw new BadRequestException('金币不足');
    await this.playerService.grantMoney(playerId, -cost);
    await this.backpackService.addItem(playerId, item.name, 1);
    return { ok: true, message: `购入 ${item.name}`, money: (player.money ?? 0) - cost };
  }

  /**
   * 炼丹核心：投入材料 → 元素能量求和 → 公差匹配 → 成败。
   * 无论成败材料全部消耗（硬核）；失败扣丹炉耐久，归零报废。
   */
  async attempt(playerId: number, recipeId: string, ingredients: IngredientInput[]): Promise<CraftResult> {
    const recipe = await this.recipeRepo.findOneBy({ recipe_id: recipeId });
    if (!recipe) throw new NotFoundException('丹方不存在');

    const player = await this.playerService.findByIdRaw(playerId);
    if (!player) throw new NotFoundException('玩家不存在');

    // 先确保有丹炉（首次会懒授予黄阶丹炉 + 一阶入门丹方）
    await this.ensureFurnace(playerId);

    // 重新读取玩家（recipes 可能刚被懒授予更新）
    const playerFresh = await this.playerService.findByIdRaw(playerId);
    // 必须已学习
    const learned = parseJson<string[]>(playerFresh?.recipes || '[]', []);
    if (!learned.includes(recipeId)) throw new BadRequestException('尚未学会该丹方，请先学习');

    const furnaceItem = await this.itemService.findByItemId(playerFresh!.equipped_furnace || 'dl-1');
    if (!furnaceItem) throw new BadRequestException('未装备丹炉，请先装备丹炉');
    const fSpec = parseJson<any>(furnaceItem.furnace_spec, { tier: 1, slots: 4, cap: 100 });
    const furnace = {
      name: furnaceItem.name,
      tier: Number(fSpec.tier) || 1,
      cap: Number(fSpec.cap) || 100,
      durability: (await this.playerService.findByIdRaw(playerId))!.furnace_durability ?? 0,
    };

    // 丹炉品阶门槛
    if (furnace.tier < recipe.min_furnace_tier) {
      throw new BadRequestException(`${furnaceItem.name}品阶不足，至少需要 ${recipe.min_furnace_tier} 阶丹炉`);
    }

    // 校验材料数量与槽位
    const distinct = new Set(ingredients.map((i) => i.name));
    if (distinct.size > Number(fSpec.slots) || ingredients.length > Number(fSpec.slots)) {
      throw new BadRequestException(`丹炉最多投放 ${fSpec.slots} 种材料`);
    }
    if (ingredients.length === 0) throw new BadRequestException('请至少投放一种材料');

    // 校验背包持有量
    const bp = await this.backpackService.getByPlayer(playerId);
    const owned = new Map(this.backpackService.parseItems(bp.items).map((i) => [i.name, i.count]));
    for (const ing of ingredients) {
      if ((owned.get(ing.name) ?? 0) < ing.count) {
        throw new BadRequestException(`材料 ${ing.name} 数量不足`);
      }
    }

    const required = parseJson<Record<string, number>>(recipe.required, {});
    const tolerance = parseJson<Record<string, number>>(recipe.tolerance, {});

    // 取材料 item 定义，求元素能量总和
    const names = [...distinct];
    const dbItems = await this.itemService.findByNames(names);
    const itemMap = new Map(dbItems.map((i) => [i.name, i]));
    const totals: Record<string, number> = {};
    for (const ing of ingredients) {
      const it = itemMap.get(ing.name);
      if (!it) throw new BadRequestException(`未知材料 ${ing.name}`);
      const el = parseJson<Record<string, number>>(it.element_energy, {});
      for (const e of Object.keys(el)) {
        totals[e] = (totals[e] || 0) + (el[e] || 0) * ing.count;
      }
    }

    // 无论成败先消耗材料（硬核）
    for (const ing of ingredients) {
      await this.backpackService.removeItem(playerId, ing.name, ing.count);
    }

    // 判定：每种要求元素须落在公差区间，且任一元素不超丹炉 cap
    let success = true;
    let reason = '';
    // 超 cap 直接炸炉
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
    if (success && Object.keys(required).length === 0) {
      success = false;
      reason = '丹方配置异常';
    }

    let output: { name: string; count: number } | null = null;
    if (success) {
      const outItem = await this.itemService.findByItemId(recipe.output_item_id);
      const yield_ = recipe.base_yield || 1;
      if (outItem) {
        await this.backpackService.addItem(playerId, outItem.name, yield_);
        output = { name: outItem.name, count: yield_ };
        reason = `炼制成功，获得 ${outItem.name} ×${yield_}`;
      }
    } else {
      // 失败扣耐久，归零报废
      const fresh = await this.playerService.findByIdRaw(playerId);
      const newDur = (fresh?.furnace_durability ?? 1) - 1;
      if (newDur > 0) {
        await this.playerService.patch(playerId, { furnace_durability: newDur });
        furnace.durability = newDur;
        reason += `（丹炉耐久 -1，剩余 ${newDur}）`;
      } else {
        await this.playerService.patch(playerId, { furnace_durability: 0, equipped_furnace: null as any });
        furnace.durability = 0;
        reason += '（丹炉耐久耗尽，丹炉报废！）';
      }
    }

    return { success, reason, output, totals, required, tolerance, furnace };
  }
}
