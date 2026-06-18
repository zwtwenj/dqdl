import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlayerService } from '../player/player.service';
import { MobService } from '../mob/mob.service';
import { TechniqueService } from '../technique/technique.service';
import { BackpackService } from '../backpack/backpack.service';
import { ItemService } from '../item/item.service';
import { LocationService } from './location.service';

/** 怪物掉落条目（对应 mob.drops JSON 元素） */
interface MobDrop {
  item_id: string;
  name: string;
  rate: number;
  min: number;
  max: number;
  type: '专属' | '公共';
}

/** 掉落结果 */
interface DropResult {
  item_id: string;
  name: string;
  count: number;
}

export interface TrainingEvent {
  text: string;
  mob: { mob_id: string; name: string };
  battle: {
    win_rate: number;
    rounds: number;
    style: string;
    player_total: number;
    mob_total: number;
  };
  /** 本次历练是否胜利 */
  won: boolean;
  /** 本次历练掉落的物品（失败为空） */
  drops: DropResult[];
}

@Injectable()
export class TrainingService {
  private readonly agentUrl: string;

  constructor(
    private config: ConfigService,
    private playerService: PlayerService,
    private mobService: MobService,
    private techniqueService: TechniqueService,
    private locationService: LocationService,
    private backpackService: BackpackService,
    private itemService: ItemService,
  ) {
    this.agentUrl = config.get<string>('AGENT_URL', 'http://localhost:5000');
  }

  /** 总属性 = 力量+智力+敏捷+体质 */
  private totalAttrs(attrs: { power: number; intelligence: number; quick: number; stamina: number }): number {
    return attrs.power + attrs.intelligence + attrs.quick + attrs.stamina;
  }
  /** 根据掉落率随机计算实际掉落，通过 item_id 查 item 表获取 clean name */
  private async calcDrops(dropsJson: string | null): Promise<DropResult[]> {
    if (!dropsJson) return [];
    let dropDefs: MobDrop[];
    try { dropDefs = JSON.parse(dropsJson); } catch { return []; }

    // 收集所有 item_id，批量查 item 表
    const ids = [...new Set(dropDefs.map(d => d.item_id))];
    const items = await this.itemService.findByItemIds(ids);
    const itemMap = new Map(items.map(it => [it.item_id, it]));

    const result: DropResult[] = [];
    for (const d of dropDefs) {
      if (Math.random() <= d.rate) {
        const count = Math.floor(Math.random() * (d.max - d.min + 1)) + d.min;
        // 优先用 item 表的干净名称，找不到则 fallback 到 mob drops 里的 name
        const cleanName = itemMap.get(d.item_id)?.name || d.name;
        result.push({ item_id: d.item_id, name: cleanName, count });
      }
    }
    return result;
  }

  /**
   * 执行一次历练事件（从地点 common_mobs 随机遭遇魔兽）
   */
  async execute(playerId: number, locationId: number): Promise<TrainingEvent> {
    // 1. 获取玩家
    const player = await this.playerService.findOne(playerId);
    if (!player) throw new Error('玩家不存在');

    // 2. 获取地点
    const location = await this.locationService.findOne(locationId);
    if (!location) throw new Error('地点不存在');

    // 3. 从地点 common_mobs 随机选一只魔兽
    let mobId: string | null = null;
    if (location.common_mobs) {
      try {
        const mobs: { mob_id: string }[] = JSON.parse(location.common_mobs);
        if (mobs.length > 0) {
          mobId = mobs[Math.floor(Math.random() * mobs.length)].mob_id;
        }
      } catch { /* ignore parse error */ }
    }
    // 地点没有 common_mobs 或解析失败：从全部 WB-xxx 魔兽中随机
    if (!mobId) {
      const allMobs = await this.mobService.findAll();
      const wbMobs = allMobs.filter(m => m.mob_id?.startsWith('WB-'));
      if (wbMobs.length === 0) throw new Error('没有可用魔兽数据');
      mobId = wbMobs[Math.floor(Math.random() * wbMobs.length)].mob_id;
    }

    const mob = await this.mobService.findByMobId(mobId);
    if (!mob) throw new Error(`魔兽 ${mobId} 数据未找到`);

    // 4. 计算战斗
    const playerTotal = this.totalAttrs({
      power: player.final_attrs?.power ?? player.power,
      intelligence: player.final_attrs?.intelligence ?? player.intelligence,
      quick: player.final_attrs?.quick ?? player.quick,
      stamina: player.final_attrs?.stamina ?? player.stamina,
    });
    const mobTotal = this.totalAttrs({
      power: mob.power,
      intelligence: mob.intelligence,
      quick: mob.quick,
      stamina: mob.stamina,
    });

    const ratio = mobTotal > 0 ? mobTotal / playerTotal : 0;
    let winRate: number;
    let style: string;

    if (ratio < 0.5) {
      winRate = 100; style = '随手斩杀';
    } else if (ratio < 0.8) {
      winRate = 75; style = '轻松获胜';
    } else if (ratio < 1.0) {
      winRate = 50; style = '势均力敌';
    } else if (ratio < 1.5) {
      winRate = 25; style = '艰难苦战';
    } else if (ratio <= 2) {
      winRate = 10; style = '九死一生';
    } else {
      winRate = 0; style = '毫无胜算';
    }
    const rounds = 1;

    // 5. 胜率判定
    const won = Math.random() * 100 < winRate;

    // 6. 胜利计算掉落并入背包，失败则无掉落
    const drops: DropResult[] = won ? await this.calcDrops(mob.drops) : [];
    for (const d of drops) {
      await this.backpackService.addItem(playerId, d.name, d.count);
    }

    // 7. 调 agent 生成叙事文本（胜利/失败都调用）
    const techniqueName = player.technique?.name ?? '无';
    const resp = await fetch(`${this.agentUrl}/generate/training`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: { name: player.name, technique_name: techniqueName },
        mob: { mob_id: mob.mob_id, name: mob.name, description: mob.description },
        battle: { win_rate: winRate, rounds, style, player_total: playerTotal, mob_total: mobTotal },
        location: { name: location.name, description: location.description },
        won,
        drops: drops.map(d => ({ name: d.name, count: d.count })),
      }),
    });

    const data = await resp.json() as any;
    const text = data.text || `你遭遇了一只${mob.name}。`;

    return { text, mob: { mob_id: mob.mob_id, name: mob.name || '' },
      battle: { win_rate: winRate, rounds, style, player_total: playerTotal, mob_total: mobTotal },
      won,
      drops,
    };
  }
}
