import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LocationNet } from './location-net.entity';
import { LocationScene } from './location-scene.entity';
import { Player } from '../player/player.entity';
import { PLAYER_STATUS } from '../player/player.service';
import { Biz } from '../common/biz.exception';
import { AgentService } from '../agent/agent.service';
import { NpcService } from '../npc/npc.service';
import { ScriptTriggerService } from '../script/script-trigger.service';
import { MAP } from '../config/game.config';

/**
 * 按 loc_type 概率分布掷骰。分布来自 game.config（原硬编码散落两处，已合并）。
 */
function rollLocTypeFromDist(dist: Record<string, number> = MAP.locTypeDist): string {
  const r = Math.random();
  let acc = 0;
  for (const [type, p] of Object.entries(dist)) {
    acc += p;
    if (r < acc) return type;
  }
  // 兜底（分布未归一或舍入误差）：取最后一项
  const keys = Object.keys(dist);
  return keys[keys.length - 1] ?? 'wild';
}

/**
 * 网状地图 + 场景 服务（地图生成走 agent/DeepSeek，失败降级到名称池）。
 *
 * 数据模型（见 docs/map-graph-redesign.md 和 migrations/add_location_net_scene.sql）：
 *   location_net   平面地图节点，整数网格 (gx,gy)，4 对角邻接（X 形交叉网）
 *   location_scene 地图内部场景（城市：坊市/佣兵公会/炼药师公会），不显示在地图上
 *
 * 玩家位置双状态：
 *   player.location_id = 当前所在地图节点（location_net.id）
 *   player.scene_id    = 当前所在场景（location_scene.id，NULL=在地图上未进场景）
 */

// ---------- 4 对角方向 ----------
interface DirDef {
  key: string;
  dx: number;
  dy: number;
  cn: string;
}
const DIRS: DirDef[] = [
  { key: 'NE', dx: 1, dy: 1, cn: '东北' },
  { key: 'NW', dx: -1, dy: 1, cn: '西北' },
  { key: 'SE', dx: 1, dy: -1, cn: '东南' },
  { key: 'SW', dx: -1, dy: -1, cn: '西南' },
];
const DIR_MAP = new Map(DIRS.map((d) => [d.key, d]));
// 边去重：只看 NE/NW，SE/SW 由对端补齐
const EDGE_DIRS = ['NE', 'NW'];

// ---------- 城市默认场景模板（丹房→炼药师公会） ----------
interface SceneTemplate {
  name: string;
  scene_type: string;
  description: (cityName: string) => string;
  available_actions: string[];
}
const CITY_SCENES: SceneTemplate[] = [
  {
    name: '佣兵公会',
    scene_type: 'guild',
    description: (c) => `${c}的佣兵公会分部，发布和接取各类任务，佣兵们的聚集之地。`,
    available_actions: ['quest', 'rest'],
  },
  {
    name: '坊市',
    scene_type: 'market',
    description: (c) => `${c}的坊市，中低端物品交易集散地，各类商贩云集，偶有意外之宝。`,
    available_actions: ['buy', 'sell', 'explore'],
  },
  {
    name: '炼药师公会',
    scene_type: 'alchemy',
    description: (c) => `${c}炼药师公会分部，炼药师考核与丹药交易的权威场所。`,
    available_actions: ['buy', 'sell', 'cultivate'],
  },
  {
    name: '修炼室',
    scene_type: 'cultivation',
    description: (c) => `${c}的修炼室，斗气浓郁、环境清幽，适合闭关修炼、精进修为（按席位列费）。`,
    available_actions: ['cultivate'],
  },
];

// ---------- 命名素材池（真实工程换 agent/DeepSeek） ----------
const NAME_POOL: Record<string, string[]> = {
  wild: [
    '迷雾森林', '荒芜戈壁', '幽暗山谷', '毒雾沼泽', '落日草原', '血色荒原', '千年古林', '寒霜雪原',
    '枯骨荒漠', '暗影丘陵', '碧水幽潭', '万蛇裂谷', '陨星台地', '苍翠密林', '烈日沙海', '霜月冰原',
    '百兽山岭', '幽冥涧底', '飞瀑深涧', '荆棘莽原',
  ],
  city: [
    '加玛城', '出云城', '黑岩城', '白石都', '紫晶城', '风灵城', '赤焰城',
    '青锋城', '落霞都', '云梦城', '玄铁城', '碧落城', '苍梧城', '月华城',
  ],
  sect: [
    '云岚宗', '黑骷盟', '百花谷', '铁血门', '天蛇府',
    '万剑山庄', '药王谷', '噬魂殿', '青云观', '血煞宗',
  ],
  secret: [
    '古帝洞府', '天焚神塔', '远古遗迹', '异火秘境',
    '龙皇古冢', '上古剑冢', '虚无雷池', '混沌秘境',
  ],
};
const DESC_POOL = [
  '此地灵气充沛，草木葱茏。',
  '四周寂静无人，远处隐有兽吼。',
  '空气中弥漫着淡淡的药香。',
  '地势险要，易守难攻。',
  '人流熙攘，商队络绎不绝。',
  '迷雾缭绕，难辨方向。',
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
/** 数字转中文序号后缀：2→② 3→③ ...，用于重名改名（赤焰城 → 赤焰城②） */
function cnOrdinal(n: number): string {
  const symbols = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
  return symbols[n - 1] ?? `(${n})`;
}
/** 安全 parse JSON 字符串（TEXT 列存的），失败/空返回 null */
function safeParseJson(s: string | null): any[] | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// ---------- 返回类型 ----------
export interface NetNodeView {
  id: number;
  name: string;
  loc_type: string;
  description: string | null;
  gx: number;
  gy: number;
  is_frontier: boolean;
  danger_level: number;
  qi_density: number;
  tags: string[] | null;
  common_mobs: any[] | null;
  common_herbs: any[] | null;
}
export interface NetEdgeView {
  from_id: number;
  to_id: number;
  direction: string;
  direction_cn: string;
  distance: number;
  travel_type: string;
}
export interface ExitView {
  edge_id: string;
  direction: string;
  direction_cn: string;
  distance: number;
  travel_type: string;
  status: 'open' | 'unknown';
  to: { id: number; name: string; loc_type: string } | null;
}

@Injectable()
export class LocationNetService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LocationNetService.name);

  constructor(
    @InjectRepository(LocationNet) private readonly netRepo: Repository<LocationNet>,
    @InjectRepository(LocationScene) private readonly sceneRepo: Repository<LocationScene>,
    @InjectRepository(Player) private readonly playerRepo: Repository<Player>,
    private readonly agent: AgentService,
    private readonly npcService: NpcService,
    private readonly scriptTrigger: ScriptTriggerService,
  ) {}

  /**
   * 启动兜底：给所有已存在的场景补齐"必生 NPC"。
   * 这些场景是在本次改造前创建的，创建时不会触发 ensureCityScenes 的补 NPC 逻辑，
   * 这里统一补一次（幂等，已有就跳过）。
   *
   * 注意：每个新 NPC 都要调一次 agent 起名，存量场景较多时耗时较长。
   * 因此这里 fire-and-forget（不 await），不阻塞应用启动；后台跑完即可。
   * 后续重启时多数 NPC 已存在，ensureSceneNpcs 会快速跳过。
   */
  onApplicationBootstrap() {
    // 不 await：后台补齐，不卡启动
    this.backfillSceneNpcs().catch((e) =>
      this.logger.warn(`启动补 NPC 整体失败（不阻断启动）：${e}`),
    );
  }

  private async backfillSceneNpcs() {
    const scenes = await this.sceneRepo.find();
    if (scenes.length === 0) return;
    this.logger.log(`启动检查 ${scenes.length} 个场景的必生 NPC...`);
    const netNameCache = new Map<number, string>();
    // 场景间并发，单个场景内串行（避免同一城市场景内 NPC 名字相互串）
    await Promise.all(
      scenes.map(async (s) => {
        try {
          if (!netNameCache.has(s.net_id)) {
            const n = await this.netRepo.findOneBy({ id: s.net_id });
            if (n) netNameCache.set(s.net_id, n.name);
          }
          const cityName = netNameCache.get(s.net_id);
          await this.npcService.ensureSceneNpcs(s.id, s.scene_type, s.name, cityName);
        } catch (e) {
          this.logger.warn(`启动补 NPC 跳过场景 ${s.name}：${e}`);
        }
      }),
    );
    this.logger.log('✅ 必生 NPC 检查完成');
  }

  // ---------- 映射 ----------
  private toView(n: LocationNet): NetNodeView {
    return {
      id: n.id,
      name: n.name,
      loc_type: n.loc_type,
      description: n.description,
      gx: n.gx,
      gy: n.gy,
      is_frontier: !!n.is_frontier,
      danger_level: n.danger_level,
      qi_density: n.qi_density,
      tags: n.tags,
      common_mobs: safeParseJson(n.common_mobs),
      common_herbs: safeParseJson(n.common_herbs),
    };
  }

  private travelType(a: LocationNet, b: LocationNet): string {
    const settle = (t: string) => t === 'city' || t === 'sect';
    if (settle(a.loc_type) && settle(b.loc_type)) return 'road';
    return 'wild';
  }

  // ---------- 读：全图 ----------
  async getGraph() {
    const nodes = await this.netRepo.find({ order: { id: 'ASC' } });
    const byGrid = new Map(nodes.map((n) => [`${n.gx},${n.gy}`, n]));
    const edges: NetEdgeView[] = [];
    for (const n of nodes) {
      for (const dk of EDGE_DIRS) {
        const d = DIR_MAP.get(dk)!;
        const m = byGrid.get(`${n.gx + d.dx},${n.gy + d.dy}`);
        if (!m) continue;
        edges.push({
          from_id: Math.min(n.id, m.id),
          to_id: Math.max(n.id, m.id),
          direction: d.key,
          direction_cn: d.cn,
          distance: randInt(60, 100),
          travel_type: this.travelType(n, m),
        });
      }
    }
    return { nodes: nodes.map((n) => this.toView(n)), edges };
  }

  /**
   * 矩形范围查询：返回 [minGX,maxGX] × [minGY,maxGY] 内的节点 + 边。
   * 供大地图按视口增量加载。gx/gy 有联合唯一索引 uk_grid，范围查询高效。
   * 边只返回两端节点都在结果集内的（避免引用未加载节点，导致前端画断线）。
   */
  async getNodesInBBox(minGX: number, minGY: number, maxGX: number, maxGY: number) {
    const nodes = await this.netRepo
      .createQueryBuilder('n')
      .where('n.gx >= :minGX AND n.gx <= :maxGX', { minGX, maxGX })
      .andWhere('n.gy >= :minGY AND n.gy <= :maxGY', { minGY, maxGY })
      .orderBy('n.id', 'ASC')
      .getMany();
    const views = nodes.map((n) => this.toView(n));
    const byId = new Map(views.map((v) => [v.id, v]));
    const byGrid = new Map(nodes.map((n) => [`${n.gx},${n.gy}`, n]));
    // 边：复用 EDGE_DIRS 去重逻辑，只取两端都在结果集内的
    const edges: NetEdgeView[] = [];
    for (const n of nodes) {
      for (const dk of EDGE_DIRS) {
        const d = DIR_MAP.get(dk)!;
        const m = byGrid.get(`${n.gx + d.dx},${n.gy + d.dy}`);
        if (!m) continue;
        edges.push({
          from_id: Math.min(n.id, m.id),
          to_id: Math.max(n.id, m.id),
          direction: d.key,
          direction_cn: d.cn,
          distance: 70,
          travel_type: this.travelType(n, m),
        });
      }
    }
    return { nodes: views, edges };
  }

  // ---------- 读：单节点 / 场景 / 出口 ----------
  async getNode(id: number): Promise<NetNodeView | null> {
    const n = await this.netRepo.findOneBy({ id });
    return n ? this.toView(n) : null;
  }

  async getScenes(netId: number) {
    const scenes = await this.sceneRepo.find({
      where: { net_id: netId },
      order: { id: 'ASC' },
    });
    // 附带每个场景的 NPC 列表（前端进场景后直接渲染对话入口）
    // 复用 NpcService.findByLocation：这里是场景 id，显式传 type='scene'
    // findByLocation 返回 { static, dynamic }，这里合并成单个数组并打 is_dynamic 标记，
    // 让前端 scene.npcs 仍是数组（v-if=npcs.length 生效），且能区分静态/动态。
    const result: Array<Record<string, unknown>> = [];
    for (const s of scenes) {
      const npcData = await this.npcService.findByLocation(s.id, 'scene');
      result.push({
        id: s.id,
        net_id: s.net_id,
        name: s.name,
        scene_type: s.scene_type,
        description: s.description,
        available_actions: s.available_actions,
        npcs: [
          ...(npcData.static || []).map((n) => ({ ...n, is_dynamic: false })),
          ...(npcData.dynamic || []).map((n) => ({ ...n, is_dynamic: true })),
        ],
      });
    }
    return result;
  }

  async getExits(id: number): Promise<ExitView[]> {
    const n = await this.netRepo.findOneBy({ id });
    if (!n) throw Biz.notFound(`地图节点 ${id} 不存在`);
    const byGrid = new Map<string, LocationNet>();
    const all = await this.netRepo.find();
    for (const x of all) byGrid.set(`${x.gx},${x.gy}`, x);

    const out: ExitView[] = [];
    for (const d of DIRS) {
      const m = byGrid.get(`${n.gx + d.dx},${n.gy + d.dy}`);
      if (m) {
        out.push({
          edge_id: `e-${Math.min(n.id, m.id)}-${Math.max(n.id, m.id)}`,
          direction: d.key,
          direction_cn: d.cn,
          distance: 70,
          travel_type: this.travelType(n, m),
          status: 'open',
          to: { id: m.id, name: m.name, loc_type: m.loc_type },
        });
      } else {
        out.push({
          edge_id: `stub-${n.id}-${d.key}`,
          direction: d.key,
          direction_cn: d.cn,
          distance: 0,
          travel_type: 'wild',
          status: 'unknown',
          to: null,
        });
      }
    }
    return out;
  }

  /**
   * 玩家视野（迷雾机制核心）：
   *   ring0 = 玩家所在节点
   *   ring1 = 玩家位置的 4 个对角邻居（永远可见，无迷雾）
   *   ring2 = 每个 ring1 节点再往外的对角方向（迷雾，只显示方位，不显示目的地）
   * 仅返回玩家当前能"看见"的节点 + 边 + 迷雾出口；其余已存在节点不返回（未发现）。
   */
  async getPlayerView(playerId: number) {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    if (player.location_id == null) throw Biz.conflict('玩家尚未在任何地图上');

    // 兜底：保证玩家所在节点的 ring1 全部生成（首次进入/数据缺失时）
    await this.ensureRing1(player.location_id);

    const all = await this.netRepo.find();
    const byGrid = new Map<string, LocationNet>();
    for (const x of all) byGrid.set(`${x.gx},${x.gy}`, x);

    const center = byGrid.get(
      // 上面查 location_id 对应的 gx/gy；用 all 查一下更稳
      (() => {
        const c = all.find((n) => n.id === player.location_id);
        return c ? `${c.gx},${c.gy}` : '';
      })(),
    );
    if (!center) throw Biz.conflict('玩家所在地图节点不存在');

    const visibleNodes = new Map<number, NetNodeView>();
    const visibleEdges: NetEdgeView[] = [];
    const fogExits: Array<{ from_gx: number; from_gy: number; direction: string; direction_cn: string }> = [];

    // ring0
    visibleNodes.set(center.id, this.toView(center));

    // ring1：4 对角邻居
    const ring1: LocationNet[] = [];
    for (const d of DIRS) {
      const nb = byGrid.get(`${center.gx + d.dx},${center.gy + d.dy}`);
      if (!nb) continue; // 理论上 ensureRing1 已补齐，这里防御
      ring1.push(nb);
      visibleNodes.set(nb.id, this.toView(nb));
      visibleEdges.push({
        from_id: Math.min(center.id, nb.id),
        to_id: Math.max(center.id, nb.id),
        direction: d.key,
        direction_cn: d.cn,
        distance: 70,
        travel_type: this.travelType(center, nb),
      });
    }

    // ring2 / ring3：逐层往外展开。每个外层节点的 4 对角方向：
    //   若该位置已有节点 → 纳入可见 + 边（环形回连也可见）
    //   若为空 → ring2 记迷雾出口（仅方位），ring3 不记（太远）
    const seenGrid = new Set<string>([`${center.gx},${center.gy}`]);
    for (const r1 of ring1) {
      seenGrid.add(`${r1.gx},${r1.gy}`);
    }
    // 上一层的节点集合，用于往外展开（ring1→展开得 ring2，ring2→展开得 ring3）
    let prevRing: LocationNet[] = ring1;
    for (let ring = 2; ring <= 3; ring++) {
      const nextRing: LocationNet[] = [];
      for (const r of prevRing) {
        for (const d of DIRS) {
          const tx = r.gx + d.dx;
          const ty = r.gy + d.dy;
          const key = `${tx},${ty}`;
          if (seenGrid.has(key)) continue; // 已在更内层
          const exist = byGrid.get(key);
          if (exist) {
            // 已有节点：可见 + 边
            if (!visibleNodes.has(exist.id)) visibleNodes.set(exist.id, this.toView(exist));
            visibleEdges.push({
              from_id: Math.min(r.id, exist.id),
              to_id: Math.max(r.id, exist.id),
              direction: d.key,
              direction_cn: d.cn,
              distance: 70,
              travel_type: this.travelType(r, exist),
            });
            seenGrid.add(key);
            nextRing.push(exist);
          } else if (ring === 2) {
            // 仅 ring2 记迷雾出口（ring3 太远不记）
            fogExits.push({ from_gx: r.gx, from_gy: r.gy, direction: d.key, direction_cn: d.cn });
            seenGrid.add(key);
          }
        }
      }
      prevRing = nextRing;
    }

    // 补全可见节点之间缺失的边：网格模型下两节点对角相邻即有边，
    // 但上面的展开只收集了"展开路径上"的边，两个分别从不同路径发现的可见节点之间的边会漏。
    // 用 EDGE_DIRS 去重（只看 NE/NW，SE/SW 由对端补齐），遍历可见节点补全。
    const visibleList = [...visibleNodes.values()];
    const edgeKeys = new Set(visibleEdges.map((e) => `${e.from_id}-${e.to_id}`));
    const visibleGrid = new Map<string, NetNodeView>();
    for (const v of visibleList) visibleGrid.set(`${v.gx},${v.gy}`, v);
    for (const v of visibleList) {
      for (const dk of EDGE_DIRS) {
        const d = DIR_MAP.get(dk)!;
        const nb = visibleGrid.get(`${v.gx + d.dx},${v.gy + d.dy}`);
        if (!nb) continue;
        const k = `${Math.min(v.id, nb.id)}-${Math.max(v.id, nb.id)}`;
        if (edgeKeys.has(k)) continue;
        edgeKeys.add(k);
        visibleEdges.push({
          from_id: Math.min(v.id, nb.id),
          to_id: Math.max(v.id, nb.id),
          direction: d.key,
          direction_cn: d.cn,
          distance: 70,
          travel_type: this.travelType(v as any, nb as any),
        });
      }
    }

    return {
      player_net_id: center.id,
      ring0: this.toView(center),
      ring1: ring1.map((n) => this.toView(n)),
      nodes: visibleList,
      edges: visibleEdges,
      fog: fogExits,
    };
  }

  // ---------- 写：拓展前沿 ----------
  /**
   * 在某节点的某对角方向（相邻空位）生成一个新地图节点。
   * 网格模型：新节点一落到网格上，它与所有已有对角邻居的边自动产生。
   * 新城市自动补 3 个默认场景（佣兵公会/坊市/炼药师公会）。
   */
  async expandFrontier(nodeId: number, direction?: string) {
    const n = await this.netRepo.findOneBy({ id: nodeId });
    if (!n) throw Biz.notFound(`地图节点 ${nodeId} 不存在`);

    // 选目标方向
    let targetDir;
    if (direction) {
      const d = DIR_MAP.get(direction);
      if (!d) throw Biz.badRequest(`未知方向 ${direction}`);
      const exist = await this.netRepo.findOneBy({ gx: n.gx + d.dx, gy: n.gy + d.dy });
      if (exist) throw Biz.conflict(`方向 ${direction} 已有节点，无需探索`);
      targetDir = d;
    } else {
      // 任选一个空位
      for (const d of DIRS) {
        const exist = await this.netRepo.findOneBy({ gx: n.gx + d.dx, gy: n.gy + d.dy });
        if (!exist) {
          targetDir = d;
          break;
        }
      }
      if (!targetDir) throw Biz.conflict('该节点四周已无空位可探索');
    }

    const gx = n.gx + targetDir.dx;
    const gy = n.gy + targetDir.dy;

    // 复用统一的节点生成逻辑（含新城市补场景）
    const saved = await this.generateNodeAt(gx, gy);
    const newScenes = await this.sceneRepo.find({ where: { net_id: saved.id } });

    // 查新节点连上了哪些已有邻居（必然 ≥1：来源方向有）
    const neighborIds: number[] = [];
    for (const d of DIRS) {
      const m = await this.netRepo.findOneBy({ gx: gx + d.dx, gy: gy + d.dy });
      if (m && m.id !== saved.id) neighborIds.push(m.id);
    }

    // 重算相关节点 frontier 标记
    await this.recomputeFrontierAround(saved.id);
    await this.recomputeFrontierAround(nodeId);

    return {
      new_node: this.toView(saved),
      new_scenes: newScenes.map((s) => ({ id: s.id, name: s.name, scene_type: s.scene_type })),
      connected_to: neighborIds,
      direction: targetDir.key,
      direction_cn: targetDir.cn,
    };
  }

  /** 给城市补默认场景（已存在的类型跳过，靠 uk_net_scene 幂等）；新场景同步补"必生 NPC" */
  private async ensureCityScenes(netId: number, cityName: string): Promise<LocationScene[]> {
    const created: LocationScene[] = [];
    for (const tpl of CITY_SCENES) {
      const exist = await this.sceneRepo.findOneBy({ net_id: netId, scene_type: tpl.scene_type });
      if (exist) continue;
      const s = await this.sceneRepo.save(
        this.sceneRepo.create({
          net_id: netId,
          name: tpl.name,
          scene_type: tpl.scene_type,
          description: tpl.description(cityName),
          available_actions: tpl.available_actions,
        }),
      );
      created.push(s);
      // 新场景 → 按 npc_role.required_in_loc_type 补齐必生 NPC（佣兵公会→公会接待员 等）
      // 失败不阻断场景创建；agent 不可用时 NpcService 内部会随机兜底
      try {
        await this.npcService.ensureSceneNpcs(s.id, s.scene_type, s.name, cityName);
      } catch (e) {
        this.logger.warn(`场景 ${s.name}(${s.scene_type}) 补 NPC 失败：${e}`);
      }
    }
    return created;
  }

  /** 重算某节点及其对角邻居的 frontier 标记 */
  private async recomputeFrontierAround(nodeId: number) {
    const n = await this.netRepo.findOneBy({ id: nodeId });
    if (!n) return;
    const hasEmpty = await this.hasEmptyNeighbor(n.gx, n.gy);
    const newVal = hasEmpty ? 1 : 0;
    if (n.is_frontier !== newVal) {
      n.is_frontier = newVal;
      await this.netRepo.save(n);
    }
  }

  private async hasEmptyNeighbor(gx: number, gy: number): Promise<boolean> {
    for (const d of DIRS) {
      const exist = await this.netRepo.findOneBy({ gx: gx + d.dx, gy: gy + d.dy });
      if (!exist) return true;
    }
    return false;
  }

  /**
   * Ring1 自动生成：保证某节点的 4 个对角邻居全部存在。
   * 玩家走到某节点后，该节点的 ring1 永远可见、无迷雾。
   * 返回新建的节点列表（已存在的邻居不返回）。
   *
   * 性能：多个新节点用 Promise.all 并发调 agent（避免串行卡顿）。
   * agent context：把中心节点 + 已有邻居作为周边信息传给 LLM，避免重名、保持地理连贯。
   */
  /**
   * Ring1 自动生成：保证某节点的 4 个对角邻居全部存在。
   * 玩家走到某节点后，该节点的 ring1 永远可见、无迷雾。
   *
   * 实现：算出所有空位 + server 给每个定 loc_type → 一次 agent 批量调用
   * （同一 prompt 生成全部，天然不内部重名）→ 直接填空入库。
   * 一次 LLM 调用就够，不存在并发/串行之争。
   */
  async ensureRing1(nodeId: number): Promise<LocationNet[]> {
    const n = await this.netRepo.findOneBy({ id: nodeId });
    if (!n) throw Biz.notFound(`地图节点 ${nodeId} 不存在`);

    // 1. 收集空位（待生成的对角邻居）
    const slots: { gx: number; gy: number }[] = [];
    for (const d of DIRS) {
      const exist = await this.netRepo.findOneBy({ gx: n.gx + d.dx, gy: n.gy + d.dy });
      if (!exist) slots.push({ gx: n.gx + d.dx, gy: n.gy + d.dy });
    }
    if (slots.length === 0) return [];

    // 2. server 给每个空位定 loc_type（保留分布）
    const nodesRequest = slots.map((s) => ({
      loc_type: this.rollLocType(),
      gx: s.gx,
      gy: s.gy,
    }));

    // 3. 收集 agent context：中心节点 + 已存在的对角邻居
    const parentContext: { name: string; loc_type: string; direction?: string }[] = [
      { name: n.name, loc_type: n.loc_type, direction: '中心' },
    ];
    for (const d of DIRS) {
      const m = await this.netRepo.findOneBy({ gx: n.gx + d.dx, gy: n.gy + d.dy });
      if (m) parentContext.push({ name: m.name, loc_type: m.loc_type, direction: d.cn });
    }
    const existingNames = (await this.netRepo.find()).map((x) => x.name);

    // 4. 一次 agent 批量调用（同 prompt 生成全部节点，天然不内部重名）
    let items = await this.agent.generateMapNodes({
      nodes: nodesRequest,
      parent_context: parentContext,
      existingNames,
    });

    // 5. 兜底：agent 失败，用 fallback 名称池补齐
    if (!items) {
      this.logger.warn('agent 批量生成不可用，fallback 名称池');
      items = nodesRequest.map((nr) => this.fallbackNodeItem(nr, existingNames));
    }

    // 6. 填空入库（按坐标对齐，重名再加 ② 后缀做最终保险）
    const usedNames = new Set(existingNames);
    const created: LocationNet[] = [];
    for (const nr of nodesRequest) {
      // 找到与该坐标匹配的 agent 结果
      let item = items.find((it) => it.gx === nr.gx && it.gy === nr.gy);
      if (!item) {
        // 兜底：agent 漏了某个坐标
        item = this.fallbackNodeItem(nr, [...usedNames]);
      }
      let finalName = item.name;
      if (usedNames.has(finalName)) {
        let i = 2;
        while (usedNames.has(`${finalName}${cnOrdinal(i)}`)) i++;
        finalName = `${finalName}${cnOrdinal(i)}`;
        this.logger.warn(`节点 (${nr.gx},${nr.gy}) 仍重名，改名 ${finalName}`);
      }
      usedNames.add(finalName);
      const node = await this.commitNodeFromItem(item, finalName);
      created.push(node);
      this.logger.log(`填空 (${nr.gx},${nr.gy}) ${item.loc_type}: ${finalName}`);
    }

    await this.recomputeFrontierAround(nodeId);
    return created;
  }

  /* ============ 佣兵任务用：三格内野外查询 + 定向生成 ============ */

  /**
   * 查某节点 maxDist 格内（切比雪夫距离 max(|dx|,|dy|) ≤ maxDist）的野外地图。
   * 用于佣兵任务找候选击杀地点。返回的节点已 parse common_mobs。
   * 不要求 common_mobs 非空（由调用方过滤），便于复用。
   * @returns LocationNet 视图数组（含 id/name/loc_type/danger_level/common_mobs 等）
   */
  async findWildsWithin(
    netId: number,
    maxDist = 3,
  ): Promise<NetNodeView[]> {
    const center = await this.netRepo.findOneBy({ id: netId });
    if (!center) throw Biz.notFound(`地图节点 ${netId} 不存在`);
    const all = await this.netRepo.find();
    const wilds = all.filter((n) => {
      if (n.loc_type !== 'wild') return false;
      const dist = Math.max(Math.abs(n.gx - center.gx), Math.abs(n.gy - center.gy));
      return dist > 0 && dist <= maxDist;
    });
    return wilds.map((n) => this.toView(n));
  }

  /**
   * 为已有野外节点补填 common_mobs（不重新生成节点本身）。
   * 场景：节点生成时 agent 没返回 mobs（或走了名称池 fallback），导致 common_mobs 为空，
   * 佣兵任务等依赖 mobs 的功能用不了。此处惰性补填：调 agent 的 /generate/wild-mobs
   * 按 danger_level 用 RAG 检索真实魔兽，写回 common_mobs 列。
   *
   * @param netId  野外节点 id
   * @param maxCount 期望 mob 数量，默认 4
   * @returns 补填成功返回更新后的节点视图（含 common_mobs）；agent 不可用 / RAG 无命中返回 null
   */
  async fillWildMobs(netId: number, maxCount = 4): Promise<NetNodeView | null> {
    const node = await this.netRepo.findOneBy({ id: netId });
    if (!node) return null;
    // 已有 mobs 则不重复补填（幂等）
    const existing = safeParseJson(node.common_mobs);
    if (Array.isArray(existing) && existing.length > 0) {
      return this.toView(node);
    }

    const { mobs } = await this.agent.generateWildMobs({
      name: node.name,
      danger_level: node.danger_level,
      description: node.description || undefined,
      tags: Array.isArray(node.tags) ? node.tags : undefined,
      max_count: maxCount,
    });
    if (!mobs || mobs.length === 0) {
      this.logger.warn(`补填 wild mobs 失败：节点 ${node.name}(${netId}) RAG 无命中`);
      return null;
    }

    node.common_mobs = JSON.stringify(mobs);
    await this.netRepo.save(node);
    this.logger.log(`补填 wild mobs：${node.name}(${netId}) ← ${mobs.map((m) => m.name).join('、')}`);
    return this.toView(node);
  }

  /**
   * 在某节点 maxDist 格内定向生成野外地图（佣兵任务候选不足时补齐）。
   *
   * 连通性保证（不产生孤儿图）：采用 BFS 扩散——
   *   只在"与已存在节点对角相邻"的空位中选候选位生成。每生成一个立即入库成为
   *   "已存在节点"，下一轮就能作为新锚点继续扩散，所以新节点必然连进已有网。
   *
   * 强制 loc_type='wild'（不走随机分布），复用 agent 批量生成 + commitNodeFromItem
   * （wild 会自动触发 RAG 填 common_mobs）。
   *
   * @param netId   中心节点
   * @param need    期望生成数量
   * @param maxDist 三格内限制
   * @returns 实际生成的节点数组（可能少于 need，即三格内空位已用尽）
   */
  async ensureWildsWithin(
    netId: number,
    need: number,
    maxDist = 3,
  ): Promise<LocationNet[]> {
    if (need <= 0) return [];
    const center = await this.netRepo.findOneBy({ id: netId });
    if (!center) throw Biz.notFound(`地图节点 ${netId} 不存在`);

    const created: LocationNet[] = [];
    const existingNames = (await this.netRepo.find()).map((n) => n.name);
    const usedNames = new Set(existingNames);

    // 反复扫描"与已有节点对角相邻的空位"，每轮生成一批 wild，直到凑够 need 或无空位
    // 安全上限避免极端情况下死循环
    for (let round = 0; round < maxDist + 2 && created.length < need; round++) {
      // 重新拉已存在节点（上轮可能新增了）
      const existNodes = await this.netRepo.find();
      const existSet = new Map(existNodes.map((n) => [`${n.gx},${n.gy}`, n]));

      // 收集"与已有节点对角相邻 + 三格内 + 空位"的候选坐标
      const candidateSlots: { gx: number; gy: number }[] = [];
      const seen = new Set<string>();
      for (const n of existNodes) {
        for (const d of DIRS) {
          const gx = n.gx + d.dx;
          const gy = n.gy + d.dy;
          const key = `${gx},${gy}`;
          if (seen.has(key)) continue;
          // 必须是空位（尚未存在节点）
          if (existSet.has(key)) continue;
          // 必须在三格内
          const dist = Math.max(Math.abs(gx - center.gx), Math.abs(gy - center.gy));
          if (dist > maxDist) continue;
          seen.add(key);
          candidateSlots.push({ gx, gy });
        }
      }
      if (candidateSlots.length === 0) break; // 三格内无更多可连通空位

      // 本轮要生成多少个（不超过剩余 need、不超过候选数）
      const batch = Math.min(need - created.length, candidateSlots.length);
      const slots = candidateSlots.slice(0, batch);

      // 构造 agent 批量请求：全部强制 wild
      const nodesRequest = slots.map((s) => ({ loc_type: 'wild', gx: s.gx, gy: s.gy }));
      const parentContext = [
        { name: center.name, loc_type: center.loc_type, direction: '中心' },
      ];
      let items = await this.agent.generateMapNodes({
        nodes: nodesRequest,
        parent_context: parentContext,
        existingNames: [...usedNames],
      });
      // 兜底：agent 失败用名称池（但 wild 的 common_mobs 会为 null，任务生成时会被过滤）
      if (!items) {
        this.logger.warn('定向生成 wild：agent 不可用，fallback 名称池');
        items = nodesRequest.map((nr) => this.fallbackNodeItem(nr, [...usedNames]));
      }

      // 入库（按坐标对齐，重名加序号）
      for (const nr of nodesRequest) {
        let item = items.find((it) => it.gx === nr.gx && it.gy === nr.gy);
        if (!item) item = this.fallbackNodeItem(nr, [...usedNames]);
        let finalName = item.name;
        if (usedNames.has(finalName)) {
          let i = 2;
          while (usedNames.has(`${finalName}${cnOrdinal(i)}`)) i++;
          finalName = `${finalName}${cnOrdinal(i)}`;
        }
        usedNames.add(finalName);
        const node = await this.commitNodeFromItem(item, finalName);
        created.push(node);
        this.logger.log(`定向生成 wild (${nr.gx},${nr.gy}): ${finalName}`);
        if (created.length >= need) break;
      }
    }

    // 重算相关节点 frontier 标记
    if (created.length > 0) {
      await this.recomputeFrontierAround(netId);
    }
    return created;
  }

  /** server 定 loc_type 的分布（配置于 game.config，rollLocTypeFromDist 掷骰） */
  private rollLocType(): string {
    return rollLocTypeFromDist();
  }

  /** fallback：用名称池构造一个节点 item（不入库） */
  private fallbackNodeItem(
    nr: { loc_type: string; gx: number; gy: number },
    existingNames: string[],
  ): {
    name: string;
    loc_type: string;
    description: string;
    danger_level: number;
    qi_density: number;
    tags: string[] | null;
    available_actions: string[] | null;
    common_mobs: null;
    gx: number;
    gy: number;
  } {
    const pool = NAME_POOL[nr.loc_type] || NAME_POOL.wild;
    let name = pick(pool);
    let i = 2;
    while (existingNames.includes(name)) {
      name = `${pool[Math.floor(Math.random() * pool.length)]}${cnOrdinal(i++)}`;
    }
    const danger = nr.loc_type === 'wild' ? randInt(1, 3) : 0;
    return {
      name,
      loc_type: nr.loc_type,
      description: pick(DESC_POOL),
      danger_level: danger,
      qi_density: nr.loc_type === 'wild' ? Math.round(Math.pow(1.45, danger) * 100) : 0,
      tags: nr.loc_type === 'wild' ? ['野外'] : null,
      available_actions: null,
      common_mobs: null,
      gx: nr.gx,
      gy: nr.gy,
    };
  }

  /** 把 agent item 入库（含城市补场景） */
  private async commitNodeFromItem(
    item: {
      name: string;
      loc_type: string;
      description?: string | null;
      danger_level?: number;
      qi_density?: number;
      tags?: string[] | null;
      common_mobs?: { mob_id: string; name: string; rank?: string }[] | null;
      common_herbs?: { item_id: string; name: string }[] | null;
      gx: number;
      gy: number;
    },
    finalName: string,
  ): Promise<LocationNet> {
    const node = this.netRepo.create({
      name: finalName,
      loc_type: item.loc_type,
      description: item.description || null,
      gx: item.gx,
      gy: item.gy,
      is_frontier: 1,
      danger_level: item.danger_level ?? 0,
      qi_density: item.qi_density ?? 0,
      tags: item.tags ?? null,
      common_mobs: item.common_mobs ? JSON.stringify(item.common_mobs) : null,
      common_herbs: item.common_herbs ? JSON.stringify(item.common_herbs) : null,
    });
    const saved = await this.netRepo.save(node);
    if (item.loc_type === 'city') {
      await this.ensureCityScenes(saved.id, saved.name);
    }
    return saved;
  }

  /**
   * 在指定网格点生成一个新节点（单点版，串行调用安全）。
   * server 定 loc_type，agent 生成名称/描述/文案；agent 失败走名称池 fallback。
   * 入库前会查同名并改名。新城市自动补 3 个默认场景。
   *
   * @param gx, gy         目标网格坐标
   * @param parentContext  周边已知地点（供 agent 保持地理连贯），可空
   * @param existingNames  已有地名（避免 agent 重名），可空
   */
  private async generateNodeAt(
    gx: number,
    gy: number,
    parentContext?: { name: string; loc_type: string; direction?: string }[],
    existingNames?: string[],
  ): Promise<LocationNet> {
    const candidate = await this.proposeNodeAt(gx, gy, parentContext, existingNames);
    // 单点调用也要防重名（agent 可能返回已存在的名字）
    const allNames = (await this.netRepo.find()).map((n) => n.name);
    let finalName = candidate.name;
    if (allNames.includes(finalName)) {
      let i = 2;
      while (allNames.includes(`${finalName}${cnOrdinal(i)}`)) i++;
      finalName = `${finalName}${cnOrdinal(i)}`;
      this.logger.warn(`节点 (${gx},${gy}) 与已有重名，改名为 ${finalName}`);
    }
    return this.commitNode({ ...candidate, name: finalName });
  }

  /**
   * 阶段1：生成节点候选（调 agent + 选字段，不入库，不建场景）。
   * 用于 ensureRing1 的并发阶段——多个候选可同时生成，再串行入库去重。
   */
  private async proposeNodeAt(
    gx: number,
    gy: number,
    parentContext?: { name: string; loc_type: string; direction?: string }[],
    existingNames?: string[],
  ): Promise<{
    gx: number;
    gy: number;
    name: string;
    loc_type: string;
    description: string | null;
    danger_level: number;
    qi_density: number;
    tags: string[] | null;
  }> {
    // 1. server 定类型（分布配置于 game.config）
    const loc_type = rollLocTypeFromDist();

    // 2. 调 agent 生成文案，失败走 fallback
    let name: string;
    let description: string | null;
    let danger_level: number;
    let qi_density: number;
    let tags: string[] | null;

    const agentResult = await this.agent.generateMapNode({
      loc_type,
      parent_context: parentContext,
      existingNames: existingNames ?? [],
    });

    if (agentResult) {
      name = agentResult.name;
      description = agentResult.description || null;
      danger_level = agentResult.danger_level ?? (loc_type === 'wild' ? randInt(1, 3) : 0);
      qi_density = agentResult.qi_density ?? (loc_type === 'wild' ? Math.round(Math.pow(1.45, danger_level) * 100) : 0);
      tags = agentResult.tags ?? (loc_type === 'wild' ? ['野外'] : null);
      this.logger.log(`agent 生成候选 (${gx},${gy}) ${loc_type}: ${name}`);
    } else {
      // fallback 名称池
      name = pick(NAME_POOL[loc_type] || NAME_POOL.wild);
      description = pick(DESC_POOL);
      danger_level = loc_type === 'wild' ? randInt(1, 3) : 0;
      qi_density = loc_type === 'wild' ? Math.round(Math.pow(1.45, danger_level) * 100) : 0;
      tags = loc_type === 'wild' ? ['野外'] : null;
      this.logger.warn(`agent 不可用，fallback 生成候选 (${gx},${gy}) ${loc_type}: ${name}`);
    }

    return { gx, gy, name, loc_type, description, danger_level, qi_density, tags };
  }

  /**
   * 阶段2：把候选入库（建 location_net 行 + 城市补场景）。
   * 调用方负责保证 name 在"已存在 + 本批"中唯一。
   */
  private async commitNode(c: {
    gx: number;
    gy: number;
    name: string;
    loc_type: string;
    description: string | null;
    danger_level: number;
    qi_density: number;
    tags: string[] | null;
  }): Promise<LocationNet> {
    const node = this.netRepo.create({
      name: c.name,
      loc_type: c.loc_type,
      description: c.description,
      gx: c.gx,
      gy: c.gy,
      is_frontier: 1,
      danger_level: c.danger_level,
      qi_density: c.qi_density,
      tags: c.tags,
    });
    const saved = await this.netRepo.save(node);
    if (c.loc_type === 'city') {
      await this.ensureCityScenes(saved.id, saved.name);
    }
    return saved;
  }

  // ---------- 玩家位置：移动 ----------
  /**
   * 移动玩家到目标地图节点。需校验：当前位置与目标之间有对角邻接。
   * 进入新地图自动退出原场景（scene_id 置空）。
   */
  async movePlayer(playerId: number, toNetId: number) {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    if (player.status === PLAYER_STATUS.SCRIPT || player.status === PLAYER_STATUS.MOVING) {
      throw Biz.conflict('当前状态无法移动');
    }
    const target = await this.netRepo.findOneBy({ id: toNetId });
    if (!target) throw Biz.notFound(`地图节点 ${toNetId} 不存在`);

    // 若已在目标位置，直接成功
    if (player.location_id === toNetId) {
      return { ...this.playerPosView(player), moved: false };
    }

    // 校验对角邻接（从当前位置出发）
    if (player.location_id != null) {
      const cur = await this.netRepo.findOneBy({ id: player.location_id });
      if (cur) {
        const dx = target.gx - cur.gx;
        const dy = target.gy - cur.gy;
        const isDiag = Math.abs(dx) === 1 && Math.abs(dy) === 1;
        if (!isDiag) {
          throw Biz.conflict('两地不相邻（仅对角方向可达），无法直接移动');
        }
      }
    }

    player.location_id = toNetId;
    player.scene_id = null; // 换地图自动退出场景
    await this.playerRepo.save(player);

    // 关键：玩家落地后，自动补齐该节点的 ring1（4 个对角邻居全部生成）
    // 这样玩家所在位置永远没有迷雾，迷雾只出现在 ring2
    const newlyCreated = await this.ensureRing1(toNetId);

    return { ...this.playerPosView(player), moved: true, new_nodes: newlyCreated.map((n) => n.id) };
  }

  // ---------- 玩家位置：进入/退出场景 ----------
  /** 进入场景：玩家必须在 net_id 这个地图上，且 scene 属于该地图 */
  async enterScene(playerId: number, netId: number, sceneType: string) {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    if (player.status === PLAYER_STATUS.SCRIPT || player.status === PLAYER_STATUS.MOVING) {
      throw Biz.conflict('当前状态无法进入场景');
    }
    if (player.location_id !== netId) {
      throw Biz.conflict('必须先到达该地图才能进入其场景');
    }
    const scene = await this.sceneRepo.findOneBy({ net_id: netId, scene_type: sceneType });
    if (!scene) throw Biz.notFound(`地图 ${netId} 没有类型 ${sceneType} 的场景`);

    // 兜底：给存量场景补齐必生 NPC（这些场景是在本次改造前创建的，创建时没补 NPC）
    // 幂等——已有对应职能 NPC 就跳过，所以重复进入不会重复创建
    try {
      const cityName = (await this.netRepo.findOneBy({ id: netId }))?.name;
      await this.npcService.ensureSceneNpcs(scene.id, scene.scene_type, scene.name, cityName);
    } catch (e) {
      this.logger.warn(`进入场景 ${scene.name} 时补 NPC 失败：${e}`);
    }

    player.scene_id = scene.id;
    await this.playerRepo.save(player);

    // 剧本钩子：进入场景后触发（同步判断+锁状态，选角异步）。
    // await 保证命中时玩家在 return 前已锁定，前端收到响应即处于 SCRIPT 状态。
    try {
      await this.scriptTrigger.tryTrigger({
        hook: 'enter_scene',
        playerId,
        context: [
          { type: 'player', data: { id: playerId, level: player.level, money: player.money } },
          { type: 'location', data: { netId, sceneId: scene.id, sceneType: scene.scene_type, sceneName: scene.name } },
        ],
      });
    } catch (e) {
      this.logger.warn(`进入场景触发剧本检查失败（已忽略）：${(e as Error).message}`);
    }

    return {
      ...this.playerPosView(player),
      scene: { id: scene.id, name: scene.name, scene_type: scene.scene_type, description: scene.description },
    };
  }

  /** 退出场景：回到所在地图（scene_id 置空） */
  async exitScene(playerId: number) {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    if (player.status === PLAYER_STATUS.SCRIPT || player.status === PLAYER_STATUS.MOVING) {
      throw Biz.conflict('当前状态无法退出场景');
    }
    if (player.scene_id == null) throw Biz.conflict('当前不在任何场景中');
    player.scene_id = null;
    await this.playerRepo.save(player);
    return this.playerPosView(player);
  }

  /** 查询玩家当前位置状态（地图+场景） */
  async getPlayerPos(playerId: number) {
    const player = await this.playerRepo.findOneBy({ id: playerId });
    if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);
    const view = this.playerPosView(player);
    if (player.scene_id != null) {
      const scene = await this.sceneRepo.findOneBy({ id: player.scene_id });
      if (scene) {
        return {
          ...view,
          scene: { id: scene.id, name: scene.name, scene_type: scene.scene_type, description: scene.description },
        };
      }
    }
    return view;
  }

  private playerPosView(player: Player) {
    return {
      player_id: player.id,
      name: player.name,
      net_id: player.location_id,
      scene_id: player.scene_id,
    };
  }

  // ---------- demo 用：取/建测试玩家 ----------
  /** 取 name='_mapdemo_test' 的测试玩家 */
  async getDemoPlayer(): Promise<Player> {
    const p = await this.playerRepo.findOneBy({ name: '_mapdemo_test' });
    if (!p) throw Biz.notFound('测试玩家 _mapdemo_test 不存在，请先执行 migration');
    return p;
  }

  /** 查乌坦城（起点 gx=0,gy=0）的 id，供玩家初始位置/兜底迁移用 */
  async getStartNodeId(): Promise<number> {
    const n = await this.netRepo.findOneBy({ gx: 0, gy: 0 });
    if (!n) throw Biz.notFound('起点节点（乌坦城 gx=0,gy=0）不存在，请先执行 migration');
    return n.id;
  }

  /**
   * BFS 寻路：在已存在的节点（4 对角邻接）上找 fromId→toId 的最短路径。
   * 4 对角邻接的稀疏图，分支因子仅 4，几格内寻路毫秒级。
   * 路径上每个节点都必须已生成（玩家走过/可见），否则找不到（返回 null）。
   * @returns 节点序列 [from, ..., to] 的 NetNodeView；不可达返回 null
   */
  async findPath(fromId: number, toId: number): Promise<NetNodeView[] | null> {
    if (fromId === toId) {
      const n = await this.netRepo.findOneBy({ id: fromId });
      return n ? [this.toView(n)] : null;
    }
    // 全图节点按网格索引（地图懒生成，已生成节点总数有限，全量加载可接受）
    const all = await this.netRepo.find();
    const byId = new Map(all.map((n) => [n.id, n]));
    const start = byId.get(fromId);
    const target = byId.get(toId);
    if (!start || !target) return null;
    const byGrid = new Map(all.map((n) => [`${n.gx},${n.gy}`, n]));

    // BFS
    const prev = new Map<number, number | null>(); // nodeId → 前驱 nodeId
    prev.set(fromId, null);
    const queue: number[] = [fromId];
    let found = false;
    while (queue.length) {
      const curId = queue.shift()!;
      if (curId === toId) { found = true; break; }
      const cur = byId.get(curId)!;
      for (const d of DIRS) {
        const nb = byGrid.get(`${cur.gx + d.dx},${cur.gy + d.dy}`);
        if (!nb) continue;
        if (prev.has(nb.id)) continue; // 已访问
        prev.set(nb.id, curId);
        queue.push(nb.id);
      }
    }
    if (!found) return null;

    // 回溯路径
    const path: number[] = [];
    let cur: number | null = toId;
    while (cur != null) {
      path.unshift(cur);
      cur = prev.get(cur) ?? null;
    }
    return path.map((id) => this.toView(byId.get(id)!));
  }
}
