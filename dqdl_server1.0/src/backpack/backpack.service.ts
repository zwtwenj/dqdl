import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Backpack } from './backpack.entity';
import { BackpackLog } from './backpack-log.entity';
import { Item } from '../item/item.entity';
import { Biz } from '../common/biz.exception';

/** 掉落/发放物品入参（对齐 mob.drops 的结构） */
export interface GrantEntry {
  item_id: string;
  count: number;
}

/** 背包单条 + 物品详情聚合结果 */
export interface BackpackSlot {
  id: number;
  player_id: number;
  item_id: string;
  count: number;
  slot: number | null;
  acquired_at: Date;
  updated_at: Date;
  /** 关联的物品定义（不存在则 null） */
  item: Item | null;
}

/** 背包总容量（5列×7行×10页 = 350） */
export const BACKPACK_CAPACITY = 350;

/**
 * 背包服务：管理玩家对物品的持有态 + 格位（slot 1-350）。
 *
 * 设计要点：
 * - 一个玩家一个物品一行，(player_id, item_id) 唯一。
 * - slot 记录物品在背包中的格位（1-350），(player_id, slot) 唯一。
 * - 新物品发放时自动分配最小空位 slot。
 * - 所有写入方法用事务 + 悲观行锁，防止并发冲突。
 * - 每次物品变动写一条 backpack_log 流水（审计/排查用）。
 */
@Injectable()
export class BackpackService {
  private readonly logger = new Logger(BackpackService.name);

  constructor(
    @InjectRepository(Backpack)
    private readonly repo: Repository<Backpack>,
    @InjectRepository(BackpackLog)
    private readonly logRepo: Repository<BackpackLog>,
    private readonly dataSource: DataSource,
  ) {}

  /* ============ 流水日志 ============ */

  /**
   * 写一条背包流水日志。
   * 既支持事务内（传 em）也支持独立写入（不传 em）。
   * 日志写入失败不影响业务（catch 吞掉，仅记日志）。
   */
  private async logChange(params: {
    playerId: number;
    itemId: string;
    action: string;
    source?: string | null;
    changeAmount?: number;
    countBefore?: number | null;
    countAfter?: number | null;
    fromSlot?: number | null;
    toSlot?: number | null;
    em?: any; // 事务内传 EntityManager，保证一致性
  }): Promise<void> {
    const entry: Partial<BackpackLog> = {
      player_id: params.playerId,
      item_id: params.itemId,
      action: params.action,
      source: params.source ?? null,
      change_amount: params.changeAmount ?? 0,
      count_before: params.countBefore ?? null,
      count_after: params.countAfter ?? null,
      from_slot: params.fromSlot ?? null,
      to_slot: params.toSlot ?? null,
    };
    try {
      if (params.em) {
        await params.em.save(BackpackLog, entry);
      } else {
        await this.logRepo.save(entry);
      }
    } catch (e) {
      // 日志写入失败不影响业务
      this.logger.error(`背包流水写入失败（已忽略）: ${e}`);
    }
  }

  /* ============ 查询 ============ */

  /** 查玩家整包：每条聚合 item 详情，按 slot 升序 */
  async listByPlayer(playerId: number): Promise<BackpackSlot[]> {
    const rows = await this.repo.find({
      where: { player_id: playerId },
      order: { slot: 'ASC' },
    });
    if (rows.length === 0) return [];
    return this.withItems(rows);
  }

  /** 查玩家某物品持有数量（无则 0） */
  async getCount(playerId: number, itemId: string): Promise<number> {
    const row = await this.repo.findOneBy({
      player_id: playerId,
      item_id: itemId,
    });
    return row ? row.count : 0;
  }

  /** 背包物品种类数（不同 item_id 的数量，用于容量校验） */
  async getSlotCount(playerId: number): Promise<number> {
    return this.repo.count({ where: { player_id: playerId } });
  }

  /* ============ 增加 ============ */

  /**
   * 给玩家增加物品数量（合并到已有行）。
   * 新物品自动分配最小空位 slot。
   * @param source 操作来源（如 shop_buy/quest_reward），写入流水日志
   */
  async addItem(
    playerId: number,
    itemId: string,
    count: number,
    source?: string,
  ): Promise<void> {
    if (count <= 0) {
      throw Biz.badRequest('增加数量必须大于 0');
    }
    await this.dataSource.transaction(async (em) => {
      const existing = await em.findOne(Backpack, {
        where: { player_id: playerId, item_id: itemId },
        lock: { mode: 'pessimistic_write' },
      });
      const countBefore = existing?.count ?? null;
      let slot: number | null = existing?.slot ?? null;
      if (slot === null) {
        slot = await this.findMinEmptySlotWithEm(em, playerId);
        if (slot === null) {
          throw Biz.conflict('背包已满（350格），无法放入新物品');
        }
      }
      await em.query(
        `INSERT INTO backpack (player_id, item_id, count, slot)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE count = count + VALUES(count)`,
        [playerId, itemId, count, slot],
      );
      // 写流水
      await this.logChange({
        playerId, itemId, action: 'addItem', source,
        changeAmount: count, countBefore,
        countAfter: (countBefore ?? 0) + count, em,
      });
    });
  }

  /**
   * 批量发放物品（对齐 mob.drops 滚动后的结果）。
   * @param source 操作来源（如 training_drop），写入流水日志
   */
  async grant(
    playerId: number,
    entries: GrantEntry[],
    source?: string,
  ): Promise<void> {
    if (entries.length === 0) return;
    const merged = new Map<string, number>();
    for (const e of entries) {
      if (!e.item_id || e.count <= 0) continue;
      merged.set(e.item_id, (merged.get(e.item_id) ?? 0) + e.count);
    }
    if (merged.size === 0) return;

    await this.dataSource.transaction(async (em) => {
      const existingRows = await em.find(Backpack, {
        where: { player_id: playerId },
        select: ['id', 'item_id', 'slot', 'count'],
        lock: { mode: 'pessimistic_write' },
      });
      const existingMap = new Map(existingRows.map((r) => [r.item_id, r]));
      const usedSlots = new Set(
        existingRows.map((r) => r.slot).filter((s): s is number => s !== null),
      );

      for (const [itemId, count] of merged) {
        const existing = existingMap.get(itemId);
        const countBefore = existing?.count ?? null;
        let slot = existing?.slot ?? null;
        if (slot === null) {
          slot = this.findMinEmptySlotFromUsed(usedSlots);
          if (slot === null) continue; // 背包满，跳过
          usedSlots.add(slot);
          existingMap.set(itemId, { item_id: itemId, slot, count: countBefore ?? 0 } as Backpack);
        }
        await em.query(
          `INSERT INTO backpack (player_id, item_id, count, slot)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE count = count + VALUES(count)`,
          [playerId, itemId, count, slot],
        );
        await this.logChange({
          playerId, itemId, action: 'grant', source,
          changeAmount: count, countBefore,
          countAfter: (countBefore ?? 0) + count, em,
        });
      }
    });
  }

  /* ============ 扣除 ============ */

  /**
   * 扣除玩家物品数量。扣除后 count<=0 则删除该行。
   * @param source 操作来源（如 use_item/shop_sell），写入流水日志
   */
  async removeItem(
    playerId: number,
    itemId: string,
    count: number,
    source?: string,
  ): Promise<number> {
    if (count <= 0) {
      throw Biz.badRequest('扣除数量必须大于 0');
    }
    return this.dataSource.transaction(async (em) => {
      const row = await em.findOne(Backpack, {
        where: { player_id: playerId, item_id: itemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.count < count) {
        throw Biz.conflict(
          `物品 ${itemId} 持有量不足（现有 ${row?.count ?? 0}，需 ${count}）`,
        );
      }
      const countBefore = row.count;
      const remaining = row.count - count;
      if (remaining <= 0) {
        await em.delete(Backpack, { id: row.id });
      } else {
        await em.update(Backpack, { id: row.id }, { count: remaining });
      }
      await this.logChange({
        playerId, itemId, action: 'removeItem', source,
        changeAmount: -count, countBefore,
        countAfter: remaining, em,
      });
      return remaining;
    });
  }

  /* ============ 拖拽 / 整理 ============ */

  /**
   * 拖拽移动物品：交换两个 slot 的物品。
   */
  async moveItem(
    playerId: number,
    fromSlot: number,
    toSlot: number,
  ): Promise<BackpackSlot[]> {
    if (fromSlot === toSlot) return this.listByPlayer(playerId);
    if (fromSlot < 1 || fromSlot > BACKPACK_CAPACITY || toSlot < 1 || toSlot > BACKPACK_CAPACITY) {
      throw Biz.badRequest('格位超出范围（1-350）');
    }

    await this.dataSource.transaction(async (em) => {
      const fromRow = await em.findOne(Backpack, {
        where: { player_id: playerId, slot: fromSlot },
        lock: { mode: 'pessimistic_write' },
      });
      if (!fromRow) return;
      const toRow = await em.findOne(Backpack, {
        where: { player_id: playerId, slot: toSlot },
        lock: { mode: 'pessimistic_write' },
      });

      if (!toRow) {
        fromRow.slot = toSlot;
        await em.save(fromRow);
        await this.logChange({
          playerId, itemId: fromRow.item_id, action: 'moveItem',
          fromSlot, toSlot, em,
        });
      } else if (toRow.item_id === fromRow.item_id) {
        toRow.count += fromRow.count;
        await em.save(toRow);
        await em.delete(Backpack, { id: fromRow.id });
        await this.logChange({
          playerId, itemId: fromRow.item_id, action: 'moveItem',
          changeAmount: fromRow.count, fromSlot, toSlot,
          countBefore: toRow.count - fromRow.count, countAfter: toRow.count, em,
        });
      } else {
        const oldFromSlot = fromRow.slot;
        fromRow.slot = null;
        await em.save(fromRow);
        toRow.slot = oldFromSlot;
        await em.save(toRow);
        fromRow.slot = toSlot;
        await em.save(fromRow);
        // 记录两条日志（交换）
        await this.logChange({
          playerId, itemId: fromRow.item_id, action: 'moveItem', fromSlot, toSlot, em,
        });
        await this.logChange({
          playerId, itemId: toRow.item_id, action: 'moveItem',
          fromSlot: toSlot, toSlot: fromSlot, em,
        });
      }
    });
    return this.listByPlayer(playerId);
  }

  /**
   * 整理背包：按 item_id 字典序排序，从 slot 1 开始连续分配。
   */
  async sortBackpack(playerId: number): Promise<BackpackSlot[]> {
    await this.dataSource.transaction(async (em) => {
      const rows = await em.find(Backpack, {
        where: { player_id: playerId },
        order: { item_id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      for (const r of rows) r.slot = null;
      await em.save(rows);
      for (let i = 0; i < rows.length; i++) {
        rows[i].slot = i + 1;
      }
      await em.save(rows);
      // 整理记一条汇总日志
      await this.logChange({
        playerId, itemId: '*', action: 'sortBackpack',
        changeAmount: 0, em,
      });
    });
    return this.listByPlayer(playerId);
  }

  /* ============ 清空 ============ */

  async clearByPlayer(playerId: number): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const rows = await em.find(Backpack, {
        where: { player_id: playerId },
        lock: { mode: 'pessimistic_write' },
      });
      for (const r of rows) {
        await this.logChange({
          playerId, itemId: r.item_id, action: 'clearByPlayer',
          changeAmount: -r.count, countBefore: r.count, countAfter: 0, em,
        });
      }
      await em.delete(Backpack, { player_id: playerId });
    });
  }

  async discard(playerId: number, itemId: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const row = await em.findOne(Backpack, {
        where: { player_id: playerId, item_id: itemId },
        lock: { mode: 'pessimistic_write' },
      });
      if (row) {
        await em.delete(Backpack, { id: row.id });
        await this.logChange({
          playerId, itemId, action: 'discard',
          changeAmount: -row.count, countBefore: row.count, countAfter: 0, em,
        });
      }
    });
  }

  /* ============ 内部 ============ */

  private async findMinEmptySlot(playerId: number): Promise<number | null> {
    const rows = await this.repo.find({
      where: { player_id: playerId },
      select: ['slot'],
      order: { slot: 'ASC' },
    });
    const used = new Set(rows.map((r) => r.slot));
    for (let i = 1; i <= BACKPACK_CAPACITY; i++) {
      if (!used.has(i)) return i;
    }
    return null;
  }

  private async findMinEmptySlotWithEm(em: any, playerId: number): Promise<number | null> {
    const rows = await em.find(Backpack, {
      where: { player_id: playerId },
      select: ['slot'],
      order: { slot: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    const used = new Set(rows.map((r: Backpack) => r.slot));
    for (let i = 1; i <= BACKPACK_CAPACITY; i++) {
      if (!used.has(i)) return i;
    }
    return null;
  }

  private findMinEmptySlotFromUsed(used: Set<number>): number | null {
    for (let i = 1; i <= BACKPACK_CAPACITY; i++) {
      if (!used.has(i)) return i;
    }
    return null;
  }

  private async withItems(rows: Backpack[]): Promise<BackpackSlot[]> {
    if (rows.length === 0) return [];
    const itemIds = rows.map((r) => r.item_id);
    const itemRepo = this.dataSource.getRepository(Item);
    const found = await itemRepo
      .createQueryBuilder('item')
      .where('item.item_id IN (:...ids)', { ids: itemIds })
      .getMany();
    const itemMap = new Map<string, Item>();
    for (const it of found) itemMap.set(it.item_id, it);
    return rows.map((r) => {
      const item = itemMap.get(r.item_id) ?? null;
      return {
        id: r.id,
        player_id: r.player_id,
        item_id: r.item_id,
        count: r.count,
        slot: r.slot,
        acquired_at: r.acquired_at,
        updated_at: r.updated_at,
        item,
        // 出售价（price/2 向下取整，后端计算，前端不参与 DB 派生运算）
        sell_price: Math.floor((item?.price ?? 0) / 2),
      };
    });
  }
}
