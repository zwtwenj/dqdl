import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlayerService } from '../player/player.service';
import { LocationService } from '../location/location.service';
import { BackpackService } from '../backpack/backpack.service';
import { ItemService } from '../item/item.service';
import { Item } from '../item/item.entity';

export interface GatherDrop {
  item_id: string;
  name: string;
  count: number;
}

export interface GatherEvent {
  text: string;
  drops: GatherDrop[];
  timestamp: string;
}

/**
 * 采集服务：野外地点每 tick 采集一次草药。
 * 掉落概率：80% 命中本地点匹配的常见草药，10% 命中不匹配的常见草药，10% 命中更高稀有度草药。
 * 会话令牌机制与 TrainingService 一致（防止旧 SSE 流误重置状态）。
 */
@Injectable()
export class GatherService {
  private readonly logger = new Logger(GatherService.name);
  readonly gatherInterval: number;
  readonly gatherMaxDuration: number;
  private readonly sessionToken = new Map<number, number>();

  constructor(
    private config: ConfigService,
    private playerService: PlayerService,
    private locationService: LocationService,
    private backpackService: BackpackService,
    private itemService: ItemService,
  ) {
    this.gatherInterval = config.get<number>('GATHER_INTERVAL', 10000);
    this.gatherMaxDuration = config.get<number>('GATHER_MAX_DURATION', 1800000);
  }

  async begin(playerId: number): Promise<{ token: number }> {
    const player = await this.playerService.findByIdRaw(playerId);
    if (!player) throw new NotFoundException('玩家不存在');
    if (player.status !== 1) {
      throw new BadRequestException('正在进行别的事物，请完成后再尝试采集');
    }
    await this.playerService.setStatus(playerId, 6);
    const token = (this.sessionToken.get(playerId) ?? 0) + 1;
    this.sessionToken.set(playerId, token);
    return { token };
  }

  async stop(playerId: number): Promise<void> {
    this.bumpToken(playerId);
    const player = await this.playerService.findByIdRaw(playerId);
    if (player && player.status === 6) {
      await this.playerService.setStatus(playerId, 1);
    }
  }

  currentToken(playerId: number): number {
    return this.sessionToken.get(playerId) ?? 0;
  }

  isCurrent(playerId: number, token: number): boolean {
    return this.sessionToken.get(playerId) === token;
  }

  async endIfCurrent(playerId: number, token: number): Promise<void> {
    if (this.sessionToken.get(playerId) !== token) return;
    this.sessionToken.delete(playerId);
    const player = await this.playerService.findByIdRaw(playerId);
    if (player && player.status === 6) {
      await this.playerService.setStatus(playerId, 1);
    }
  }

  private bumpToken(playerId: number): number {
    const token = (this.sessionToken.get(playerId) ?? 0) + 1;
    this.sessionToken.set(playerId, token);
    return token;
  }

  /** 判定一株草药是否常见（description 形如 "...（常见·1阶）"） */
  private isCommon(h: Item): boolean {
    return !!h.description && h.description.includes('常见');
  }

  /** 取本地点匹配的常见草药池（3-4 种） */
  private async getMatchedPool(location: any, tier: number): Promise<Item[]> {
    // 优先用地点预生成的 gather_herbs
    if (location.gather_herbs) {
      try {
        const arr: { item_id: string; name: string }[] = JSON.parse(location.gather_herbs);
        if (arr.length > 0) {
          const items = await this.itemService.findByItemIds(arr.map((a) => a.item_id));
          if (items.length > 0) return items.filter((i) => i.type === '草药');
        }
      } catch { /* ignore */ }
    }
    // 兜底：按 danger_level 从全库挑常见草药
    const all = await this.itemService.findByType('草药');
    const common = all.filter((h) => h.alchemy_tier === tier && this.isCommon(h));
    return this.sample(common, Math.min(4, common.length));
  }

  private sample<T>(arr: T[], n: number): T[] {
    const copy = [...arr];
    const out: T[] = [];
    while (out.length < n && copy.length > 0) {
      out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return out;
  }

  private pick<T>(arr: T[]): T | null {
    if (arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async execute(playerId: number, locationId: number): Promise<GatherEvent> {
    const location = await this.locationService.findOne(locationId);
    if (!location) throw new Error('地点不存在');
    const tier = Number(location.danger_level) || 0;
    if (tier <= 0) throw new Error('该地点无法采集（仅野外可采集）');

    const allHerbs = await this.itemService.findByType('草药');
    const commonAtTier = allHerbs.filter((h) => h.alchemy_tier === tier && this.isCommon(h));
    const higherAtTier = allHerbs.filter((h) => h.alchemy_tier >= tier && !this.isCommon(h));

    const matched = await this.getMatchedPool(location, tier);
    const matchedIds = new Set(matched.map((m) => m.item_id));
    const unmatchedCommon = commonAtTier.filter((h) => !matchedIds.has(h.item_id));

    const r = Math.random();
    let chosen: Item | null = null;
    let category = '';
    if (r < 0.8) {
      chosen = this.pick(matched.length > 0 ? matched : commonAtTier);
      category = '常见药材';
    } else if (r < 0.9) {
      chosen = this.pick(unmatchedCommon.length > 0 ? unmatchedCommon : commonAtTier);
      category = '常见药材';
    } else {
      chosen = this.pick(higherAtTier);
      category = '稀有药材';
    }

    const drops: GatherDrop[] = [];
    let text = `你在${location.name}搜寻了一番，一无所获。`;
    if (chosen) {
      await this.backpackService.addItem(playerId, chosen.name, 1);
      drops.push({ item_id: chosen.item_id, name: chosen.name, count: 1 });
      text = `你在${location.name}仔细搜寻，采到了一株${category}——${chosen.name}。`;
    }

    return {
      text,
      drops,
      timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }),
    };
  }
}
