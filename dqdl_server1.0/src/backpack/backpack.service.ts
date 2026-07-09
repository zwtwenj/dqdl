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
  acquired_at: Date;
  updated_at: Date;
  /** 关联的物品定义（不存在则 null） */
  item: Item | null;
}

/**
 * 背包服务：管理玩家对物品的持有态。
 *
 * 设计要点：
 * - 一个玩家一个物品一行，(player_id, item_id) 唯一。
 * - 增加数量用原生 SQL `INSERT ... ON DUPLICATE KEY UPDATE count = count + n`，原子且并发安全。
 * - 扣除数量先校验库存，UPDATE 后若 count<=0 则删除该行（保持表干净）。
 * - 查询背包时聚合 item 定义（名称/类型/图标/价格/use_effect/ref 路由）。
 *
 * 所有权校验依赖 PlayerService.verifyOwnership / verifyOwnershipByUser（背包方法接收 playerId，
 * 调用方负责先校验 playerId 属于当前 user）。
 */
@Injectable()
export class BackpackService {
  constructor(
    @InjectRepository(Backpack)
    private readonly repo: Repository<Backpack>,
    private readonly dataSource: DataSource,
  ) {}

  /* ============ 查询 ============ */

  /** 查玩家整包：每条聚合 item 详情，按获得时间倒序 */
  async listByPlayer(playerId: number): Promise<BackpackSlot[]> {
    const rows = await this.repo.find({
      where: { player_id: playerId },
      order: { acquired_at: 'DESC' },
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

  /** 查玩家某物品的背包行（含 item 详情） */
  async getSlot(
    playerId: number,
    itemId: string,
  ): Promise<BackpackSlot | null> {
    const row = await this.repo.findOneBy({
      player_id: playerId,
      item_id: itemId,
    });
    if (!row) return null;
    const [slot] = await this.withItems([row]);
    return slot;
  }

  /** 背包物品种类数（不同 item_id 的数量，用于容量校验） */
  async getSlotCount(playerId: number): Promise<number> {
    return this.repo.count({ where: { player_id: playerId } });
  }

  /* ============ 增加 ============ */

  /**
   * 给玩家增加物品数量（合并到已有行）。
   * 用 INSERT ... ON DUPLICATE KEY UPDATE 原子自增（count = count + 新值），并发安全。
   * count 必须 > 0。
   */
  async addItem(playerId: number, itemId: string, count: number): Promise<void> {
    if (count <= 0) {
      throw Biz.badRequest('增加数量必须大于 0');
    }
    await this.dataSource.query(
      `INSERT INTO backpack (player_id, item_id, count)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE count = count + VALUES(count)`,
      [playerId, itemId, count],
    );
  }

  /**
   * 批量发放物品（对齐 mob.drops 滚动后的结果）。
   * 同一 item_id 会先合并数量再写一次。
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
    for (const [itemId, count] of merged) {
      await this.dataSource.query(
        `INSERT INTO backpack (player_id, item_id, count)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE count = count + VALUES(count)`,
        [playerId, itemId, count],
      );
    }
  }

  /* ============ 扣除 / 拆分 ============ */

  /**
   * 扣除玩家物品数量。
   * 校验库存充足；扣除后 count<=0 则删除该行。
   * 返回扣除后剩余数量。
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

  /**
   * 设置某物品的精确数量（管理/修正用，不校验库存）。
   * count<=0 则删除该行。
   */
  async setCount(
    playerId: number,
    itemId: string,
    count: number,
  ): Promise<void> {
    if (count <= 0) {
      await this.repo.delete({ player_id: playerId, item_id: itemId });
      return;
    }
    await this.dataSource.query(
      `INSERT INTO backpack (player_id, item_id, count)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE count = VALUES(count)`,
      [playerId, itemId, count],
    );
  }

  /* ============ 清空 ============ */

  /** 清空玩家整包（删角色时级联调用） */
  async clearByPlayer(playerId: number): Promise<void> {
    await this.repo.delete({ player_id: playerId });
  }

  /** 删除玩家某物品整行（丢弃） */
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
      acquired_at: r.acquired_at,
      updated_at: r.updated_at,
      item: itemMap.get(r.item_id) ?? null,
    }));
  }
}
