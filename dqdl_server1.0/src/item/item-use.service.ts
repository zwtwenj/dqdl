import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Player } from '../player/player.entity';
import { Backpack } from '../backpack/backpack.entity';
import { Item } from './item.entity';
import { Pill } from '../pill/pill.entity';
import { Biz } from '../common/biz.exception';
import { PlayerService } from '../player/player.service';
import { TreasureService } from '../treasure/treasure.service';

/**
 * 通用物品使用服务：单事务完成"扣背包 + 应用效果"。
 *
 * 按 item.type 分发到不同的效果实现：
 *   - '丹药' → 查 pill 表 → 应用丹药效果(heal_hp/heal_energy/attr)
 *   - '宝物' → 查 item.ref_id(宝物定义 id) → 装备到 player.treasures
 *   - 未来新增类型只需在 switch 里加分支
 *
 * 范式：仿 PillUseService 的单事务(锁 player + backpack)，度入丹药逻辑。
 *       不调 BackpackService（避免嵌套事务），直接操作 em。
 */
@Injectable()
export class ItemUseService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly playerService: PlayerService,
    private readonly treasureService: TreasureService,
  ) {}

  /** 五维属性白名单（丹药 attr 型 target 合法值） */
  private static readonly ATTR_TARGETS = new Set([
    'power', 'intelligence', 'quick', 'stamina', 'lucky',
  ]);

  /**
   * 使用 1 个物品。按 item.type 分发效果，单事务扣背包。
   * @returns { remaining } 背包剩余数量（player 详情由 controller 通过 findOne 重取聚合）
   */
  async useItem(playerId: number, itemId: string): Promise<{ remaining: number }> {
    return this.dataSource.transaction(async (em) => {
      // 1. 查 item 定义
      const item = await em.findOne(Item, { where: { item_id: itemId } });
      if (!item) throw Biz.notFound(`物品 ${itemId} 不存在`);
      if (!item.usable) throw Biz.badRequest(`${item.name} 无法使用`);

      // 2. 锁 player 行
      const player = await em.findOne(Player, {
        where: { id: playerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);

      // 3. 锁 backpack 行 → 校验持有量
      const row = await em.findOne(Backpack, {
        where: { player_id: playerId, item_id: itemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.count < 1) {
        throw Biz.conflict(`物品 ${itemId} 持有量不足`);
      }

      // 4. 按 item.type 分发效果
      switch (item.type) {
        case '丹药':
          await this.applyPillEffect(em, player, itemId);
          break;
        case '宝物':
          await this.applyTreasureEquip(player, item);
          break;
        default:
          throw Biz.badRequest(`${item.name}（类型 ${item.type}）暂不支持使用`);
      }

      // 5. 扣背包（count-1，<=0 删行）
      const remaining = row.count - 1;
      if (remaining <= 0) {
        await em.delete(Backpack, { id: row.id });
      } else {
        await em.update(Backpack, { id: row.id }, { count: remaining });
      }

      // 6. 持久化 player（丹药效果可能改了 hp/energy/属性）
      await em.save(player);

      return { remaining };
    });
  }

  /** 丹药效果：查 pill 表，按 effect_type 应用到 player（度入原 PillUseService 逻辑）。 */
  private async applyPillEffect(em: any, player: Player, itemId: string): Promise<void> {
    const pill = await em.findOne(Pill, { where: { item_id: itemId } });
    if (!pill) throw Biz.notFound(`丹药 ${itemId} 未配置效果`);

    const { maxHp, maxEnergy } = await this.playerService.computeMaxHpEnergy(player);
    const amount = Number(pill.amount) || 0;
    switch (pill.effect_type) {
      case 'heal_hp':
        player.hp = Math.min(maxHp, player.hp + amount);
        break;
      case 'heal_energy':
        player.energy = Math.min(maxEnergy, player.energy + amount);
        break;
      case 'attr':
        if (!ItemUseService.ATTR_TARGETS.has(pill.target)) {
          throw Biz.badRequest(`丹药 ${pill.name} 配置错误：未知属性 ${pill.target}`);
        }
        (player as any)[pill.target] = (player as any)[pill.target] + amount;
        break;
      default:
        throw Biz.badRequest(`丹药 ${pill.name} 配置错误：未知效果类型 ${pill.effect_type}`);
    }
  }

  /**
   * 宝物装备：item.ref_id 指向 treasure 定义 id。
   * 在事务里直接操作 player 实体（已锁），不调 equipTreasureFromItem（它自带 findOne+save，
   * 在事务内会冲突）。校验 + 写 treasures JSON + save 由调用方事务统一处理。
   */
  private async applyTreasureEquip(player: Player, item: Item): Promise<void> {
    const treasureId = item.ref_id;
    if (!treasureId) throw Biz.badRequest(`宝物 ${item.name} 未关联定义（ref_id 为空）`);

    // 查宝物定义
    const def = await this.treasureService.findOne(treasureId);
    if (!def) throw Biz.notFound(`宝物定义 ${treasureId} 不存在`);

    // 解析当前 treasures
    let arr: Array<{ id: number; slot: number }> = [];
    try {
      const v = JSON.parse(player.treasures || '[]');
      if (Array.isArray(v)) arr = v.map((t) => ({ id: Number(t.id), slot: Number(t.slot) }));
    } catch { arr = []; }

    // 校验：同一宝物不能重复装备
    if (arr.some((t) => t.id === treasureId)) {
      throw Biz.badRequest('该宝物已装备，不可重复装备');
    }

    // 找空槽
    const usedSlots = new Set(arr.map((t) => t.slot));
    const freeSlot = [1, 2, 3, 4, 5].find((s) => !usedSlots.has(s));
    if (!freeSlot) throw Biz.badRequest('宝物栏已满（5/5）');

    // 同类上限校验
    if (def.unique_cat_max && def.unique_cat_max > 0) {
      const existingIds = arr.map((t) => t.id);
      const existingDefs = existingIds.length
        ? await this.treasureService.findByIds(existingIds)
        : [];
      const cnt = existingDefs.filter((d) => d.category === def.category).length;
      if (cnt >= def.unique_cat_max) {
        throw Biz.badRequest(`${def.category}类宝物最多携带 ${def.unique_cat_max} 件`);
      }
    }

    // 写入 treasures JSON
    arr.push({ id: treasureId, slot: freeSlot });
    player.treasures = JSON.stringify(arr);
  }
}
