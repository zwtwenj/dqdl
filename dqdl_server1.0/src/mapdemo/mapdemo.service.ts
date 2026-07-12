import { Injectable } from '@nestjs/common';

/**
 * 网状地图 DEMO（整数网格版，内存，不碰数据库）
 * --------------------------------------------------
 * 核心模型：每个地点占据一个整数网格点 (gx, gy)。
 *   - 邻接关系【完全由网格决定】：两节点网格相邻 ⇒ 自动有边。
 *   - 因此"看着近" = "网格相邻" = "连通"，三者统一，绝无扭曲。
 *   - 出口桩（unknown）= 网格上尚未生成节点的相邻空位；点了就在该网格生成节点。
 *
 * 邻接方式：只连 4 个对角方向（NE/NW/SE/SW），形成 X 形交叉网格。
 *   正交方向（N/S/E/W）不连通。每个节点最多 4 个邻居。
 *   这样从任意节点出发，能走到的所有节点其 gx+gy 奇偶性都相同
 *   （(0,0) 能到 (1,1)/(1,-1)/(-1,1)/(-1,-1)，它们的 gx+gy 都是偶数）。
 *
 * 空间感来源：方向 direction（网格方向向量）+ 距离 distance（随机赋值，仅文案用）。
 * coord 不展示给玩家，仅内部记账。
 */

// ---------- 类型 ----------
export interface MapNode {
  id: number;
  name: string;
  loc_type: string; // city / wild / town / sect / secret
  description: string;
  gx: number; // 网格 x（整数坐标，关键索引）
  gy: number; // 网格 y
  is_frontier: boolean; // 仍有相邻空位可往外拓
}

export interface MapEdge {
  from_id: number;
  to_id: number;
  direction: string; // 网格方向：N/NE/E/SE/S/SW/W/NW
  distance: number; // 路途"里"，文案用（空间感）
  travel_type: string; // road/wild/mountain/secret
  status: 'open'; // 网格模型下边都是 open（blocked 移除，屏障用 description 表达可选）
}

export interface ExitView {
  edge_id: string; // `${from}-${to}` 或 `stub-${from}-${dir}`
  direction: string;
  direction_cn: string;
  distance: number;
  travel_type: string;
  status: 'open' | 'unknown';
  description?: string;
  to: { id: number; name: string; loc_type: string } | null;
}

// ---------- 网格方向定义 ----------
// 只连 4 个对角方向（NE/NW/SE/SW），形成 X 形交叉网格。
// 正交方向（N/S/E/W）不连通。每个节点最多 4 个邻居。
const DIRS: Array<{ key: string; dx: number; dy: number; cn: string }> = [
  { key: 'NE', dx: 1, dy: 1, cn: '东北' },
  { key: 'NW', dx: -1, dy: 1, cn: '西北' },
  { key: 'SE', dx: 1, dy: -1, cn: '东南' },
  { key: 'SW', dx: -1, dy: -1, cn: '西南' },
];
const DIR_MAP = new Map(DIRS.map((d) => [d.key, d]));
export function dirCn(key: string): string {
  return DIR_MAP.get(key)?.cn ?? key;
}

// ---------- 命名素材池（真实工程换 DeepSeek） ----------
const NAME_POOL: Record<string, string[]> = {
  wild: ['迷雾森林', '荒芜戈壁', '幽暗山谷', '毒雾沼泽', '落日草原', '血色荒原', '千年古林', '寒霜雪原'],
  town: ['青山镇', '落霞村', '青石小镇', '云水驿', '风沙集', '碧水乡'],
  city: ['加玛城', '乌坦城', '出云城', '黑岩城', '白石都', '紫晶城'],
  sect: ['云岚宗', '炼药师公会', '黑骷盟', '百花谷', '铁血门'],
  secret: ['古帝洞府', '天焚神塔', '远古遗迹', '异火秘境'],
};
const DESC_POOL = [
  '此地灵气充沛，草木葱茏。',
  '四周寂静无人，远处隐有兽吼。',
  '空气中弥漫着淡淡的药香。',
  '地势险要，易守难攻。',
  '人流熙攘，商队络绎不绝。',
  '迷雾缭绕，难辨方向。',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function keyOf(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

@Injectable()
export class MapDemoService {
  private nodes = new Map<number, MapNode>();
  private byGrid = new Map<string, number>(); // "gx,gy" -> nodeId，O(1) 网格查询
  private seq = 1;

  constructor() {
    this.seed();
  }

  /** 初始种子：(0,0) 起点 + 4 个对角邻居，形成初始 X 形 */
  private seed() {
    const start = this.putNode(0, 0, {
      name: '乌坦城',
      loc_type: 'city',
      description: '加玛帝国东陲的边城，商旅往来频繁。',
    });
    // 4 个对角邻居（与起点必然连通）
    this.putNode(1, 1, { name: '青山镇', loc_type: 'town', description: '依山而建，盛产矿石。' });
    this.putNode(1, -1, { name: '落霞村', loc_type: 'town', description: '落霞满天的小村落。' });
    this.putNode(-1, 1, { name: '云水驿', loc_type: 'town', description: '依水而建的驿站。' });
    this.putNode(-1, -1, { name: '风沙集', loc_type: 'town', description: '边塞风沙中的集市。' });
    // 触发所有 frontier 标记重算
    this.recomputeFrontier();
    void start;
  }

  private putNode(gx: number, gy: number, p: { name: string; loc_type: string; description: string }): MapNode {
    const node: MapNode = {
      id: this.seq++,
      gx,
      gy,
      name: p.name,
      loc_type: p.loc_type,
      description: p.description,
      is_frontier: true,
    };
    this.nodes.set(node.id, node);
    this.byGrid.set(keyOf(gx, gy), node.id);
    return node;
  }

  /** 重算每个节点是否 frontier：还有相邻空位 ⇒ frontier */
  private recomputeFrontier() {
    for (const n of this.nodes.values()) {
      n.is_frontier = this.emptyNeighbors(n.gx, n.gy).length > 0;
    }
  }

  /** 返回某网格相邻的空位（未生成节点的方向），即"可探索方向" */
  private emptyNeighbors(gx: number, gy: number) {
    return DIRS.filter((d) => !this.byGrid.has(keyOf(gx + d.dx, gy + d.dy)));
  }
  /** 返回某网格相邻的已有节点方向 */
  private occupiedNeighbors(gx: number, gy: number) {
    return DIRS.filter((d) => this.byGrid.has(keyOf(gx + d.dx, gy + d.dy)));
  }

  // ---------- 对外读 ----------
  /** 全图：节点 + 边。边按网格邻接自动派生。 */
  graph() {
    const nodes = [...this.nodes.values()];
    // 派生边：对每个节点，只看 NE/NW 两个方向避免重复（SE/SW 由对端补齐）
    const seenDir = ['NE', 'NW'];
    const edges: MapEdge[] = [];
    for (const n of nodes) {
      for (const d of DIRS.filter((x) => seenDir.includes(x.key))) {
        const nid = this.byGrid.get(keyOf(n.gx + d.dx, n.gy + d.dy));
        if (nid == null) continue;
        const m = this.nodes.get(nid)!;
        const dist = randInt(60, 100); // 对角方向统一距离区间
        edges.push({
          from_id: Math.min(n.id, m.id),
          to_id: Math.max(n.id, m.id),
          direction: d.key,
          distance: dist,
          travel_type: this.travelTypeBetween(n, m),
          status: 'open',
        });
      }
    }
    return { nodes, edges };
  }

  private travelTypeBetween(a: MapNode, b: MapNode): string {
    if (a.loc_type === 'city' && b.loc_type === 'city') return 'road';
    if (a.loc_type === 'town' && b.loc_type === 'town') return 'road';
    if ((a.loc_type === 'city' || a.loc_type === 'town') && (b.loc_type === 'city' || b.loc_type === 'town'))
      return 'road';
    return 'wild';
  }

  node(id: number) {
    return this.nodes.get(id) ?? null;
  }

  /** 出口：已有邻居(open) + 相邻空位(unknown 桩) */
  exits(id: number): ExitView[] {
    const n = this.nodes.get(id);
    if (!n) return [];
    const out: ExitView[] = [];
    for (const d of DIRS) {
      const nid = this.byGrid.get(keyOf(n.gx + d.dx, n.gy + d.dy));
      if (nid != null) {
        const m = this.nodes.get(nid)!;
        out.push({
          edge_id: `e-${Math.min(n.id, m.id)}-${Math.max(n.id, m.id)}`,
          direction: d.key,
          direction_cn: d.cn,
          distance: d.dx !== 0 && d.dy !== 0 ? 70 : 50,
          travel_type: this.travelTypeBetween(n, m),
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
          description: '一片迷雾，尚未探查',
          to: null,
        });
      }
    }
    return out;
  }

  // ---------- 对外写：拓展前沿 ----------
  /**
   * 在某节点的某方向（相邻空位）生成一个新节点。
   * 网格模型的妙处：新节点一落到网格上，它与所有已有网格邻居的边【自动产生】，
   * 无需显式回连。所以 (1,0) 往北走出 (1,1)，(1,1) 天然连 (1,0)、(0,1)、(2,0) 等所有相邻已存在节点。
   */
  expandFrontier(nodeId: number, direction?: string) {
    const n = this.nodes.get(nodeId);
    if (!n) throw new Error(`节点 ${nodeId} 不存在`);

    // 选目标空位
    let targetDir;
    if (direction) {
      const d = DIR_MAP.get(direction);
      if (!d) throw new Error(`未知方向 ${direction}`);
      if (this.byGrid.has(keyOf(n.gx + d.dx, n.gy + d.dy)))
        throw new Error(`方向 ${direction} 已有节点，无需探索`);
      targetDir = d;
    } else {
      const empties = this.emptyNeighbors(n.gx, n.gy);
      if (empties.length === 0) throw new Error('该节点四周已无空位可探索');
      targetDir = pick(empties);
    }

    const gx = n.gx + targetDir.dx;
    const gy = n.gy + targetDir.dy;

    // 选地点类型（偏向 wild，毕竟是新探索区）
    const r = Math.random();
    const loc_type = r < 0.6 ? 'wild' : r < 0.85 ? 'town' : 'secret';
    const node = this.putNode(gx, gy, {
      name: pick(NAME_POOL[loc_type] || NAME_POOL.wild),
      loc_type,
      description: pick(DESC_POOL),
    });

    // 自动连边：查出它有哪些已有邻居（必然 ≥1，因为来源方向有）
    const neighborIds = this.occupiedNeighbors(gx, gy).map((d) =>
      this.byGrid.get(keyOf(gx + d.dx, gy + d.dy))!,
    );

    this.recomputeFrontier();
    return {
      new_node: { id: node.id, gx: node.gx, gy: node.gy, name: node.name, loc_type },
      connected_to: neighborIds,
      direction: targetDir.key,
      direction_cn: targetDir.cn,
    };
  }
}
