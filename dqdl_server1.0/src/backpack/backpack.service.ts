import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Backpack } from './backpack.entity';
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
 * - 增加数量用原生 SQL `INSERT ... ON DUPLICATE KEY UPDATE count = count + n`，原子且并发安全。
 * - 拖拽（moveItem）= 交换两个 slot；整理（sortBackpack）= 按 item_id 排序重排 slot。
 */
@Injectable()
export class BackpackService {
  constructor(
    @InjectRepository(Backpack)
    private readonly repo: Repository<Backpack>,
    private readonly dataSource: DataSource,
  ) {}

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
   * 找到玩家背包的最小空位 slot（1-350）。
   * 遍历已占用 slot，找第一个空缺。背包满返回 null。
   */
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

  /**
   * 给玩家增加物品数量（合并到已有行）。
   * 新物品自动分配最小空位 slot。
   */
  async addItem(playerId: number, itemId: string, count: number): Promise<void> {
    if (count <= 0) {
      throw Biz.badRequest('增加数量必须大于 0');
    }
    // 查是否已有该物品（有则只 +count，不动 slot）
    const existing = await this.repo.findOneBy({ player_id: playerId, item_id: itemId });
    let slot: number | null = existing?.slot ?? null;
    if (slot === null) {
      slot = await this.findMinEmptySlot(playerId);
      if (slot === null) {
        throw Biz.conflict('背包已满（350格），无法放入新物品');
      }
    }
    await this.dataSource.query(
      `INSERT INTO backpack (player_id, item_id, count, slot)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE count = count + VALUES(count)`,
      [playerId, itemId, count, slot],
    );
  }

  /**
   * 批量发放物品（对齐 mob.drops 滚动后的结果）。
   * 同一 item_id 会先合并数量再写一次。每个新 item_id 分配一个空位 slot。
   */
  async grant(playerId: number, entries: GrantEntry[]): Promise<void> {
    if (entries.length === 0) return;
    // 合并同 item_id
    const merged = new Map<string, number>();
    for (const e of entries) {
      if (!e.item_id || e.count <= 0) continue;
      merged.set(e.item_id, (merged.get(e.item_id) ?? 0) + e.count);
    }
    if (merged.size === 0) return;

    // 查已有物品（避免重复分配 slot）
    const existingRows = await this.repo.find({
      where: { player_id: playerId },
      select: ['item_id', 'slot'],
    });
    const existingMap = new Map(
      existingRows.map((r) => [r.item_id, r.slot]),
    );
    const usedSlots = new Set(
      existingRows.map((r) => r.slot).filter((s): s is number => s !== null),
    );

    for (const [itemId, count] of merged) {
      let slot = existingMap.get(itemId) ?? null;
      if (slot === null) {
        // 找最小空位
        slot = this.findMinEmptySlotFromUsed(usedSlots);
        if (slot === null) continue; // 背包满，跳过此物品
        usedSlots.add(slot);
        existingMap.set(itemId, slot);
      }
      await this.dataSource.query(
        `INSERT INTO backpack (player_id, item_id, count, slot)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE count = count + VALUES(count)`,
        [playerId, itemId, count, slot],
      );
    }
  }

  /** 从已占用 slot 集合中找最小空位（grant 批量时用，避免逐条查询） */
  private findMinEmptySlotFromUsed(used: Set<number>): number | null {
    for (let i = 1; i <= BACKPACK_CAPACITY; i++) {
      if (!used.has(i)) return i;
    }
    return null;
  }

  /* ============ 扣除 ============ */

  /**
   * 扣除玩家物品数量。扣除后 count<=0 则删除该行。
   */
  async removeItem(
    playerId: number,
    itemId: string,
    count: number,
  ): Promise<number> {
    if (count <= 0) {
      throw Biz.badRequest('扣除数量必须大于 0');
    }
    const row = await this.repo.findOneBy({
      player_id: playerId,
      item_id: itemId,
    });
    if (!row || row.count < count) {
      throw Biz.conflict(
        `物品 ${itemId} 持有量不足（现有 ${row?.count ?? 0}，需 ${count}）`,
      );
    }
    const remaining = row.count - count;
    if (remaining <= 0) {
      await this.repo.delete({ id: row.id });
      return 0;
    }
    await this.repo.update({ id: row.id }, { count: remaining });
    return remaining;
  }

  /* ============ 拖拽 / 整理 ============ */

  /**
   * 拖拽移动物品：交换两个 slot 的物品。
   * - 目标格为空 → 直接移过去
   * - 目标格有同 item_id → 合并数量，源格删除
   * - 目标格有不同 item_id → 交换两格
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
    const fromRow = await this.repo.findOneBy({ player_id: playerId, slot: fromSlot });
    if (!fromRow) return this.listByPlayer(playerId); // 源格空，无操作
    const toRow = await this.repo.findOneBy({ player_id: playerId, slot: toSlot });

    if (!toRow) {
      // 目标格空：直接移过去
      fromRow.slot = toSlot;
      await this.repo.save(fromRow);
    } else if (toRow.item_id === fromRow.item_id) {
      // 同物品合并：数量加到目标格，删除源格
      toRow.count += fromRow.count;
      await this.repo.save(toRow);
      await this.repo.delete({ id: fromRow.id });
    } else {
      // 不同物品交换 slot
      fromRow.slot = toSlot;
      toRow.slot = fromSlot;
      await this.repo.save([fromRow, toRow]);
    }
    return this.listByPlayer(playerId);
  }

  /**
   * 整理背包：按 item_id 字典序排序，从 slot 1 开始连续分配。
   */
  async sortBackpack(playerId: number): Promise<BackpackSlot[]> {
    const rows = await this.repo.find({
      where: { player_id: playerId },
      order: { item_id: 'ASC' },
    });
    // 逐个重分配 slot（1,2,3...）
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].slot !== i + 1) {
        rows[i].slot = i + 1;
      }
    }
    await this.repo.save(rows);
    return this.listByPlayer(playerId);
  }

  /* ============ 清空 ============ */

  async clearByPlayer(playerId: number): Promise<void> {
    await this.repo.delete({ player_id: playerId });
  }

  async discard(playerId: number, itemId: string): Promise<void> {
    await this.repo.delete({ player_id: playerId, item_id: itemId });
  }

  /* ============ 内部：聚合 item 详情 ============ */

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
    return rows.map((r) => ({
      id: r.id,
      player_id: r.player_id,
      item_id: r.item_id,
      count: r.count,
      slot: r.slot,
      acquired_at: r.acquired_at,
      updated_at: r.updated_at,
      item: itemMap.get(r.item_id) ?? null,
    }));
  }
}
