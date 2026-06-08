import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlayerService } from '../player/player.service';
import { MobService } from '../mob/mob.service';
import { TechniqueService } from '../technique/technique.service';
import { LocationService } from './location.service';

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
  ) {
    this.agentUrl = config.get<string>('AGENT_URL', 'http://localhost:5000');
  }

  /** 总属性 = 力量+智力+敏捷+体质 */
  private totalAttrs(attrs: { power: number; intelligence: number; quick: number; stamina: number }): number {
    return attrs.power + attrs.intelligence + attrs.quick + attrs.stamina;
  }

  /**
   * 执行一次历练事件
   * @param playerId 玩家ID
   * @param locationId 地点ID
   */
  async execute(playerId: number, locationId: number): Promise<TrainingEvent> {
    // 1. 获取玩家（含功法+最终属性）
    const player = await this.playerService.findOne(playerId);
    if (!player) throw new Error('玩家不存在');

    // 2. 获取地点
    const location = await this.locationService.findOne(locationId);
    if (!location) throw new Error('地点不存在');

    // 3. 从 common_mobs 中随机选一只怪物
    const mobList = location.common_mobs ? JSON.parse(location.common_mobs) : [];
    if (mobList.length === 0) throw new Error('该地点没有怪物');
    const pick = mobList[Math.floor(Math.random() * mobList.length)];

    // 4. 获取怪物详情
    const mob = await this.mobService.findByMobId(pick.mob_id);
    if (!mob) throw new Error('怪物不存在');

    // 5. 计算战斗
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

    // 战斗判定
    const ratio = mobTotal > 0 ? mobTotal / playerTotal : 0;
    let winRate: number;
    let rounds: number;
    let style: string;

    if (ratio < 0.5) {
      winRate = 100;
      rounds = 1;
      style = '随手斩杀';
    } else if (ratio < 0.8) {
      winRate = 90;
      rounds = Math.max(1, Math.ceil(3 * ratio));
      style = '轻松获胜';
    } else if (ratio < 1.0) {
      winRate = 70;
      rounds = Math.max(2, Math.ceil(5 * ratio));
      style = '势均力敌';
    } else if (ratio < 1.5) {
      winRate = 40;
      rounds = Math.max(3, Math.ceil(7 * ratio));
      style = '艰难苦战';
    } else {
      winRate = 10;
      rounds = Math.max(5, Math.ceil(10 * ratio));
      style = '九死一生';
    }

    const techniqueName = player.technique?.name ?? '无';

    // 6. 调 agent 生成叙事文本
    const resp = await fetch(`${this.agentUrl}/generate/training`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: { name: player.name, technique_name: techniqueName },
        mob: {
          mob_id: mob.mob_id,
          name: mob.name,
          description: mob.description,
        },
        battle: { win_rate: winRate, rounds, style, player_total: playerTotal, mob_total: mobTotal },
        location: { name: location.name, description: location.description },
      }),
    });

    const data = await resp.json() as any;
    const text = data.text || `你遭遇了一只${mob.name}。`;

    return {
      text,
      mob: { mob_id: mob.mob_id, name: mob.name || '' },
      battle: { win_rate: winRate, rounds, style, player_total: playerTotal, mob_total: mobTotal },
    };
  }
}
