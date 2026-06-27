import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlayerService } from '../player/player.service';
import { MobService } from '../mob/mob.service';
import { TechniqueService } from '../technique/technique.service';
import { BackpackService } from '../backpack/backpack.service';
import { ItemService } from '../item/item.service';
import { LocationService } from '../location/location.service';
import { TaskService } from '../task/task.service';
import { SkillService } from '../skill/skill.service';
import { AgentClient } from '../agent/agent.client';
import { BattleService } from '../battle/battle.service';
import { EncounterService } from '../encounter/encounter.service';

interface PlayerSkillEntry {
  id: number;
  level: number;
  carry?: number | null;
}

interface EquippedSkill {
  id: number;
  name: string;
  level: number;
  description?: string | null;
  attr?: string;
  base_damage?: number;
  rank?: number;
}

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

/** 历练任务进度更新条目 */
export interface TaskProgressUpdate {
  taskId: number;
  description: string;
  current: number;
  required: number;
  done: boolean;
}

export interface TrainingEvent {
  text: string;
  mob: { mob_id: string; name: string } | null;
  battle: {
    win_rate: number;
    rounds: number;
    style: string;
    player_total: number;
    mob_total: number;
  } | null;
  won: boolean | null;
  drops: DropResult[];
  task_updates: TaskProgressUpdate[];
  timestamp: string;
  /** 本次历练触发的奇遇（10% 概率，可能为 null） */
  encounter?: { id: number; kind: string; title: string; description: string; scene_type: string; star: number | null } | null;
}

/**
 * 历练服务：从地点 common_mobs 随机遭遇魔兽 → 战斗结算（BattleService.resolveQuickBattle）
 * → 掉落入背包 → 任务进度推进 → agent 叙事。
 *
 * 阶段 1.3：从 location/ 提升为独立 training 模块，使 LocationModule 不再为训练背负
 * Task/Skill/Backpack/Item 等依赖，让"编排型"耦合显式归属到训练域。
 */
@Injectable()
export class TrainingService {
  readonly trainingInterval: number;
  readonly trainingMaxDuration: number;

  /**
   * 历练会话令牌（每个玩家一个）。玩家每次开始/停止历练都会自增，
   * SSE 流在结束时只有"令牌仍匹配"才把状态恢复为空闲，
   * 从而避免旧流误把新会话的状态重置（刷新页面后立即重连的竞态）。
   */
  private readonly sessionToken = new Map<number, number>();

  constructor(
    private config: ConfigService,
    private playerService: PlayerService,
    private mobService: MobService,
    private techniqueService: TechniqueService,
    private locationService: LocationService,
    private backpackService: BackpackService,
    private itemService: ItemService,
    private taskService: TaskService,
    private skillService: SkillService,
    private agentClient: AgentClient,
    private battleService: BattleService,
    private readonly encounterService: EncounterService,
  ) {
    this.trainingInterval = config.get<number>('TRAINING_INTERVAL', 180000);
    this.trainingMaxDuration = config.get<number>('TRAINING_MAX_DURATION', 10800000);
  }

  /** 开始历练：校验空闲 → 置历练中(2) → 颁发会话令牌。状态由后端统一管理 */
  async begin(playerId: number): Promise<{ token: number }> {
    const player = await this.playerService.findByIdRaw(playerId);
    if (!player) throw new NotFoundException('玩家不存在');
    if (player.status !== 1) {
      throw new BadRequestException('正在进行别的事物，请完成后再尝试进入');
    }
    await this.playerService.setStatus(playerId, 2);
    const token = (this.sessionToken.get(playerId) ?? 0) + 1;
    this.sessionToken.set(playerId, token);
    return { token };
  }

  /** 主动停止历练：立即恢复空闲(1) 并使旧 SSE 流失效（令牌自增） */
  async stop(playerId: number): Promise<void> {
    this.bumpToken(playerId);
    const player = await this.playerService.findByIdRaw(playerId);
    if (player && player.status === 2) {
      await this.playerService.setStatus(playerId, 1);
    }
  }

  /** SSE 流读取当前令牌（用于自识别是否仍是活跃会话） */
  currentToken(playerId: number): number {
    return this.sessionToken.get(playerId) ?? 0;
  }

  /** SSE 流判断自己是否仍是当前会话 */
  isCurrent(playerId: number, token: number): boolean {
    return this.sessionToken.get(playerId) === token;
  }

  /**
   * SSE 流结束（客户端断开/刷新/超时）：若本流仍是当前会话（未被新的 begin/stop 取代），
   * 才把状态恢复为空闲。这是客户端消失时唯一的兜底回收路径。
   */
  async endIfCurrent(playerId: number, token: number): Promise<void> {
    if (this.sessionToken.get(playerId) !== token) return;
    this.sessionToken.delete(playerId);
    const player = await this.playerService.findByIdRaw(playerId);
    if (player && player.status === 2) {
      await this.playerService.setStatus(playerId, 1);
    }
  }

  private bumpToken(playerId: number): number {
    const token = (this.sessionToken.get(playerId) ?? 0) + 1;
    this.sessionToken.set(playerId, token);
    return token;
  }

  /** 解析玩家已装备斗技 */
  private async parseEquippedSkills(skillJson: string | null): Promise<EquippedSkill[]> {
    if (!skillJson) return [];
    let entries: PlayerSkillEntry[];
    try { entries = JSON.parse(skillJson); } catch { return []; }
    if (!Array.isArray(entries)) return [];

    const equipped = entries.filter(e => e.carry && e.carry >= 1 && e.carry <= 5);
    const result: EquippedSkill[] = [];
    for (const e of equipped) {
      const def = await this.skillService.findOne(e.id);
      if (!def) continue;
      result.push({
        id: e.id,
        name: def.name,
        level: e.level,
        description: def.description,
        attr: def.attr,
        base_damage: def.base_damage,
        rank: def.rank,
      });
    }
    return result;
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

    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    const techniqueName = player.technique?.name ?? '无';

    // 非门：先尝试触发奇遇，成功则本次为奇遇事件（不遇怪物），否则为怪物事件
    let encounterEntry: any = null;
    try {
      encounterEntry = await this.encounterService.tryGenerate(playerId);
    } catch { /* ignore */ }
    if (encounterEntry) {
      let etext = encounterEntry.description;
      try {
        const ed = await this.agentClient.generateEncounter({
          player: { name: player.name, technique_name: techniqueName },
          location: { name: location.name, description: location.description },
          encounter: {
            kind: encounterEntry.kind, title: encounterEntry.title,
            scene_type: encounterEntry.scene_type, star: encounterEntry.star,
            description: encounterEntry.description,
          },
        });
        etext = ed.text || encounterEntry.description;
      } catch { /* fallback 用模板描述 */ }
      return {
        text: etext,
        mob: null, battle: null, won: null,
        drops: [], task_updates: [],
        timestamp,
        encounter: {
          id: encounterEntry.id, kind: encounterEntry.kind, title: encounterEntry.title,
          description: encounterEntry.description, scene_type: encounterEntry.scene_type,
          star: encounterEntry.star,
        },
      };
    }

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

    // 4. 战斗结算（统一走 BattleService，消除重复的战斗算法）
    const { winRate, style, won, playerTotal, mobTotal, rounds } =
      this.battleService.resolveQuickBattle(player, mob);

    // 6. 胜利计算掉落并入背包，失败则无掉落
    const drops: DropResult[] = won ? await this.calcDrops(mob.drops) : [];
    for (const d of drops) {
      await this.backpackService.addItem(playerId, d.name, d.count);
    }

    // 6.5 胜利后检查任务进度
    const task_updates = won
      ? await this.taskService.checkAndUpdateProgress(playerId, mob.name || '')
      : [];

    // 7. 调 agent 生成叙事文本（胜利/失败都调用）
    const equippedSkills = await this.parseEquippedSkills(player.skill);
    const data = await this.agentClient.generateTraining({
      player: { name: player.name, technique_name: techniqueName, equipped_skills: equippedSkills },
      mob: { mob_id: mob.mob_id, name: mob.name, description: mob.description },
      battle: { win_rate: winRate, rounds, style, player_total: playerTotal, mob_total: mobTotal },
      location: { name: location.name, description: location.description },
      won,
      drops: drops.map(d => ({ name: d.name, count: d.count })),
    });

    const text = data.text || `你遭遇了一只${mob.name}。`;

    return { text, mob: { mob_id: mob.mob_id, name: mob.name || '' },
      battle: { win_rate: winRate, rounds, style, player_total: playerTotal, mob_total: mobTotal },
      won,
      drops,
      task_updates,
      timestamp,
      encounter: null,
    };
  }
}
