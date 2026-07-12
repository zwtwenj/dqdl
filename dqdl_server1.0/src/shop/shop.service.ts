import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { NpcShop } from './shop.entity';
import { Item } from '../item/item.entity';
import { StaticNpc } from '../npc/static-npc.entity';
import { Player } from '../player/player.entity';
import { Backpack } from '../backpack/backpack.entity';
import { Biz } from '../common/biz.exception';

/**
 * 商店服务：商品查询 + 原子买/卖。
 *
 * 买/卖都在单事务内完成（锁 player 行 → 余额校验 → 扣/加钱 → 增/减背包），
 * 直接操作 repo 保证原子性（不调 BackpackService 封装以避免嵌套事务）。
 * 返回更新后的 money（前端 store 同步），无需单独的 money 接口。
 */
@Injectable()
export class ShopService {
  constructor(
    @InjectRepository(NpcShop)
    private readonly shopRepo: Repository<NpcShop>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(StaticNpc)
    private readonly npcRepo: Repository<StaticNpc>,
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
    @InjectRepository(Backpack)
    private readonly backpackRepo: Repository<Backpack>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /** 按 NPC 查商品（查 NPC→role→配货+item 详情） */
  async getShopByNpc(npcId: number): Promise<{
    npcName: string;
    roleId: number;
    items: any[];
  }> {
    const npc = await this.npcRepo.findOneBy({ id: npcId });
    if (!npc) throw Biz.notFound(`NPC ${npcId} 不存在`);
    const items = await this.getShopByRoleId(npc.role_id);
    return { npcName: npc.name, roleId: npc.role_id, items };
  }

  /** 按 role_id 查商品（join item，返回前端渲染所需字段） */
  async getShopByRoleId(roleId: number): Promise<any[]> {
    const rows = await this.shopRepo.find({
      where: { role_id: roleId },
      order: { sort: 'ASC', id: 'ASC' },
    });
    if (rows.length === 0) return [];
    const items = await this.itemRepo.find({
      where: { item_id: In(rows.map((r) => r.item_id)) },
    });
    const itemMap = new Map(items.map((it) => [it.item_id, it]));
    return rows
      .map((r) => {
        const it = itemMap.get(r.item_id);
        if (!it) return null;
        return {
          item_id: it.item_id,
          name: it.name,
          type: it.type,
          icon: it.icon,
          price: it.price,
          description: it.description,
          sort: r.sort,
        };
      })
      .filter(Boolean);
  }

  /**
   * 购买：单事务（锁 player → 校验余额+商品 → 扣钱 → 加背包）。
   * @returns { money } 更新后的玩家金币（前端 store 同步）
   */
  async buy(
    playerId: number,
    itemId: string,
    count: number,
  ): Promise<{ money: number }> {
    if (count <= 0) throw Biz.badRequest('购买数量必须大于 0');

    return this.dataSource.transaction(async (em) => {
      // 1. 锁 player 行（悲观写锁，防并发扣费竞态）
      const player = await em.findOne(Player, {
        where: { id: playerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);

      // 2. 查商品价格（item 表是经济系统唯一权威）
      const item = await em.findOne(Item, { where: { item_id: itemId } });
      if (!item) throw Biz.notFound(`物品 ${itemId} 不存在`);
      const totalCost = item.price * count;

      // 3. 余额校验
      if (player.money < totalCost) {
        throw Biz.conflict(
          `金币不足（需 ${totalCost}，现有 ${player.money}）`,
        );
      }

      // 4. 扣钱
      player.money -= totalCost;
      await em.save(player);

      // 5. 加背包（INSERT ... ON DUPLICATE KEY UPDATE count = count + n，复用最小空槽逻辑）
      await this.addToBackpackInTx(em, playerId, itemId, count);

      return { money: player.money };
    });
  }

  /**
   * 出售：单事务（锁 player + backpack 行 → 减背包 → 加钱，售价=price/2 向下取整）。
   * @returns { money, remaining } 更新后金币 + 背包剩余数量
   */
  async sell(
    playerId: number,
    itemId: string,
    count: number,
  ): Promise<{ money: number; remaining: number }> {
    if (count <= 0) throw Biz.badRequest('出售数量必须大于 0');

    return this.dataSource.transaction(async (em) => {
      // 1. 锁 player + backpack 行
      const player = await em.findOne(Player, {
        where: { id: playerId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);

      const row = await em.findOne(Backpack, {
        where: { player_id: playerId, item_id: itemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.count < count) {
        throw Biz.conflict(
          `物品 ${itemId} 持有量不足（现有 ${row?.count ?? 0}，需 ${count}）`,
        );
      }

      // 2. 查售价（price/2 向下取整，后端计算）
      const item = await em.findOne(Item, { where: { item_id: itemId } });
      if (!item) throw Biz.notFound(`物品 ${itemId} 不存在`);
      const unitSell = Math.floor(item.price / 2);
      const totalGain = unitSell * count;

      // 3. 减背包
      const remaining = row.count - count;
      if (remaining <= 0) {
        await em.delete(Backpack, { id: row.id });
      } else {
        await em.update(Backpack, { id: row.id }, { count: remaining });
      }

      // 4. 加钱
      player.money += totalGain;
      await em.save(player);

      return { money: player.money, remaining };
    });
  }

  /**
   * 事务内加背包物品（INSERT ... ON DUPLICATE KEY UPDATE + 最小空槽分配）。
   * 复刻 BackpackService.addItem 的核心逻辑，但用传入的 em 保证与扣钱同事务。
   */
  private async addToBackpackInTx(
    em: any,
    playerId: number,
    itemId: string,
    count: number,
  ): Promise<void> {
    // 已有则累加
    const existing = await em.findOne(Backpack, {
      where: { player_id: playerId, item_id: itemId },
    });
    if (existing) {
      await em.update(
        Backpack,
        { id: existing.id },
        { count: existing.count + count },
      );
      return;
    }
    // 新增：分配最小空槽
    const minEmptySlot = await this.findMinEmptySlotInTx(em, playerId);
    await em.insert(Backpack, {
      player_id: playerId,
      item_id: itemId,
      count,
      slot: minEmptySlot,
      acquired_at: new Date(),
      updated_at: new Date(),
    });
  }

  /** 事务内查最小空槽（1..350 中首个未被占用） */
  private async findMinEmptySlotInTx(
    em: any,
    playerId: number,
  ): Promise<number> {
    const rows = await em.find(Backpack, {
      where: { player_id: playerId },
      select: ['slot'],
    });
    const used = new Set(rows.map((r: any) => r.slot));
    for (let i = 1; i <= 350; i++) {
      if (!used.has(i)) return i;
    }
    throw Biz.conflict('背包已满');
  }
}
