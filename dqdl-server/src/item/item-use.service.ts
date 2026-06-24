import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from './item.entity';
import { PlayerService } from '../player/player.service';
import { resolveUseEffect, ItemEffectDescriptor } from './item-effect.library';

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch { return fallback; }
}

export interface UseOutcome {
  ok: boolean;
  error?: string;
  message?: string;
  player?: any;
}

/**
 * 物品使用效果结算（共享逻辑）
 * 解析 item.use_effect → 即时效果写回玩家列 / 战斗buff登记到 player.buff。
 * 不负责扣减物品来源（主背包 / 副本临时背包由调用方各自扣减）。
 */
@Injectable()
export class ItemUseService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    private readonly playerService: PlayerService,
  ) {}

  async applyUseEffect(playerId: number, name: string): Promise<UseOutcome> {
    const dbItem = await this.itemRepo.findOneBy({ name });
    if (!dbItem) return { ok: false, error: '物品不存在' };
    if (!dbItem.usable || !dbItem.use_effect) return { ok: false, error: '该物品无法使用' };

    const player = await this.playerService.findByIdRaw(playerId);
    if (!player) return { ok: false, error: '玩家不存在' };

    const desc = parseJson<ItemEffectDescriptor | null>(dbItem.use_effect, null);
    const result = resolveUseEffect(player, desc);
    if (!result.ok) return { ok: false, error: result.message };

    if (result.patch) await this.playerService.patch(playerId, result.patch);
    if (result.pendingBuff) {
      const list = parseJson<any[]>(player.buff || '[]', []);
      list.push(result.pendingBuff);
      await this.playerService.patch(playerId, { buff: JSON.stringify(list) });
    }

    const fresh = await this.playerService.findByIdRaw(playerId);
    return { ok: true, message: result.message, player: fresh };
  }
}
