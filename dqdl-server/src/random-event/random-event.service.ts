import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RandomEvent } from './random-event.entity';
import { PlayerService } from '../player/player.service';
import { BackpackService } from '../backpack/backpack.service';

/** 单条 effect：{ money: ±n } | { giveItem: { name, count } } */
export interface EventEffect {
  money?: number;
  giveItem?: { name: string; count: number };
}

/** 触发 payload 契约（按 trigger_type 携带不同字段） */
export interface TriggerPayload {
  locType?: string;
  name?: string;
  availableActions?: string[];
  playerLevel?: number;
  success?: boolean;
  star?: number;
  taskKind?: string;
  [k: string]: any;
}

@Injectable()
export class RandomEventService {
  private readonly logger = new Logger(RandomEventService.name);

  constructor(
    @InjectRepository(RandomEvent)
    private readonly repo: Repository<RandomEvent>,
    private readonly playerService: PlayerService,
    private readonly backpackService: BackpackService,
  ) {}

  /**
   * 触发检测：按 trigger_type 取候选 → 按 weight 降序 → 逐条匹配 conditions
   * → 命中则 roll chance，第一个掷中的即返回其节点图。无命中返回 null。
   */
  async check(
    playerId: number,
    triggerType: string,
    payload: TriggerPayload,
  ): Promise<{ event_id: string; title: string; nodes: any } | null> {
    const candidates = await this.repo.find({
      where: { trigger_type: triggerType, enabled: 1 },
      order: { weight: 'DESC', id: 'ASC' },
    });

    for (const ev of candidates) {
      let cond: any = {};
      try {
        cond = JSON.parse(ev.conditions || '{}');
      } catch {
        continue;
      }
      if (!this.matchConditions(cond, payload)) continue;

      if (Math.random() <= Number(ev.chance)) {
        let nodes: any = {};
        try {
          nodes = JSON.parse(ev.nodes || '{}');
        } catch {
          nodes = {};
        }
        this.logger.log(`玩家 ${playerId} 触发事件 ${ev.event_id} (${triggerType})`);
        return { event_id: ev.event_id, title: ev.title, nodes };
      }
    }
    return null;
  }

  /**
   * 落地一批 effect：money 走 grantMoney（负数即扣除），giveItem 走背包叠加。
   * 返回刷新后的金币与背包，供前端同步。
   */
  async apply(playerId: number, effects: EventEffect[]): Promise<{ money: number; items: any[] }> {
    let moneyDelta = 0;
    const items: { name: string; count: number }[] = [];

    for (const eff of effects || []) {
      if (typeof eff.money === 'number') {
        moneyDelta += eff.money;
      } else if (eff.giveItem?.name) {
        items.push({ name: eff.giveItem.name, count: eff.giveItem.count || 1 });
      }
    }

    if (moneyDelta !== 0) {
      // 防止扣成负数：扣除时夹到 0
      if (moneyDelta < 0) {
        const p = await this.playerService.findByIdRaw(playerId);
        const cur = p?.money ?? 0;
        if (cur + moneyDelta < 0) moneyDelta = -cur;
      }
      await this.playerService.grantMoney(playerId, moneyDelta);
    }

    for (const it of items) {
      await this.backpackService.addItem(playerId, it.name, it.count);
    }

    const player = await this.playerService.findByIdRaw(playerId);
    const bp = await this.backpackService.getByPlayer(playerId);
    return {
      money: player?.money ?? 0,
      items: this.backpackService.parseItems(bp.items),
    };
  }

  /** 启用事件列表（调试/作者用） */
  findAllEnabled() {
    return this.repo.find({ where: { enabled: 1 }, order: { trigger_type: 'ASC', weight: 'DESC' } });
  }

  /**
   * 条件匹配：所有出现的键都满足才算命中（AND）；数组键为"命中其一"(OR)。
   * 未知键忽略，便于前向兼容。
   */
  private matchConditions(cond: any, p: TriggerPayload): boolean {
    if (typeof cond.locType !== 'undefined') {
      if (!cond.locType.includes(p.locType)) return false;
    }
    if (Array.isArray(cond.nameIncludes) && cond.nameIncludes.length) {
      const name = p.name || '';
      if (!cond.nameIncludes.some((kw: string) => name.includes(kw))) return false;
    }
    if (Array.isArray(cond.availableActions) && cond.availableActions.length) {
      const have = p.availableActions || [];
      if (!cond.availableActions.some((a: string) => have.includes(a))) return false;
    }
    if (typeof cond.minLevel !== 'undefined') {
      if ((p.playerLevel ?? 0) < cond.minLevel) return false;
    }
    if (typeof cond.maxLevel !== 'undefined') {
      if ((p.playerLevel ?? 0) > cond.maxLevel) return false;
    }
    if (typeof cond.success !== 'undefined') {
      if (!!p.success !== !!cond.success) return false;
    }
    if (typeof cond.minStar !== 'undefined') {
      if ((p.star ?? 0) < cond.minStar) return false;
    }
    if (typeof cond.taskKind !== 'undefined') {
      if (p.taskKind !== cond.taskKind) return false;
    }
    return true;
  }
}
