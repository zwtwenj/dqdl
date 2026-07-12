import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Player } from '../player/player.entity';
import { Backpack } from '../backpack/backpack.entity';
import { Item } from '../item/item.entity';
import { Pill } from './pill.entity';
import { Biz } from '../common/biz.exception';
import { PlayerService } from '../player/player.service';

/**
 * 丹药使用服务：单事务完成"扣背包 + 应用效果到 player"。
 *
 * 仿 shop.service.sell 的范式：在一个 dataSource.transaction 内锁 player + backpack 行，
 * 校验持有量，应用效果，扣数量，save(player)。直接操作 em 而非调 BackpackService，
 * 避免嵌套事务。
 *
 * 即时型效果（本次范围）：
 *   heal_hp     player.hp = min(真实max_hp, hp + amount)  真实max_hp含已装备功法加成
 *   heal_energy player.energy = min(真实max_energy, energy + amount)  同上
 *   attr        player[target] += amount（target ∈ 五维）
 * buff 型丹药（带回下战）不在本服务，留后续。
 */
@Injectable()
export class PillUseService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly playerService: PlayerService,
  ) {}

  /** 五维属性白名单（attr 型 target 合法值） */
  private static readonly ATTR_TARGETS = new Set([
    'power', 'intelligence', 'quick', 'stamina', 'lucky',
  ]);

  /**
   * 使用 1 颗丹药。
   * @returns { remaining } 背包剩余数量（player 详情由 controller 通过 findOne 重取聚合）
   */
  async usePill(playerId: number, itemId: string): Promise<{ remaining: number }> {
    return this.dataSource.transaction(async (em) => {
      // 1. 校验物品是可使用丹药（先查 item，不锁行）
      const item = await em.findOne(Item, { where: { item_id: itemId } });
      if (!item) throw Biz.notFound(`物品 ${itemId} 不存在`);
      if (item.type !== '丹药' || !item.usable) {
        throw Biz.badRequest(`${item.name} 无法使用`);
      }

      // 2. 查丹药效果定义
      const pill = await em.findOne(Pill, { where: { item_id: itemId } });
      if (!pill) throw Biz.notFound(`丹药 ${itemId} 未配置效果`);

      // 3. 锁 player 行
      const player = await em.findOne(Player, {
        where: { id: playerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);

      // 4. 锁 backpack 行 → 校验持有量
      const row = await em.findOne(Backpack, {
        where: { player_id: playerId, item_id: itemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.count < 1) {
        throw Biz.conflict(`物品 ${itemId} 持有量不足`);
      }

      // 5. 应用效果（上限用含功法加成的真实上限，对齐 final_attrs.max_hp/max_energy）
      const { maxHp, maxEnergy } = await this.playerService.computeMaxHpEnergy(player);
      this.applyEffect(player, pill, maxHp, maxEnergy);

      // 6. 扣背包（count-1，<=0 删行）
      const remaining = row.count - 1;
      if (remaining <= 0) {
        await em.delete(Backpack, { id: row.id });
      } else {
        await em.update(Backpack, { id: row.id }, { count: remaining });
      }

      // 7. 持久化 player
      await em.save(player);

      return { remaining };
    });
  }

  /** 按 effect_type 把效果应用到 player 实例上（原地修改，调用方负责 save） */
  private applyEffect(player: Player, pill: Pill, maxHp: number, maxEnergy: number): void {
    const amount = Number(pill.amount) || 0;
    switch (pill.effect_type) {
      case 'heal_hp':
        // 上限用含功法加成的 maxHp（对齐 final_attrs），避免把功法放大的血量错误截回基础值
        player.hp = Math.min(maxHp, player.hp + amount);
        break;
      case 'heal_energy':
        player.energy = Math.min(maxEnergy, player.energy + amount);
        break;
      case 'attr': {
        if (!PillUseService.ATTR_TARGETS.has(pill.target)) {
          throw Biz.badRequest(`丹药 ${pill.name} 配置错误：未知属性 ${pill.target}`);
        }
        (player as any)[pill.target] = (player as any)[pill.target] + amount;
        break;
      }
      default:
        throw Biz.badRequest(`丹药 ${pill.name} 配置错误：未知效果类型 ${pill.effect_type}`);
    }
  }
}
