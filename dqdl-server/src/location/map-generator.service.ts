import { Injectable, Logger } from '@nestjs/common';
import { Location } from './location.entity';
import { LocationGenRule } from './location-gen-rule.entity';
import { AgentClient } from '../agent/agent.client';

export interface GenerateInput {
  parent: Location;
  rule: LocationGenRule;
  count: number;
  existingNames: string[];
}

export interface CommonMob {
  mob_id: string;
  name: string;
  rank?: string;
}

export interface GeneratedLocation {
  name: string;
  loc_type: string;
  description: string;
  danger_level: number;
  qi_density?: number;
  available_actions: string[] | null;
  tags: string[] | null;
  seed: string;
  common_mobs?: CommonMob[] | null;
}

@Injectable()
export class MapGeneratorService {
  private readonly logger = new Logger(MapGeneratorService.name);

  // 命名 → 语义类型：在生成收口处统一纠正 loc_type（仅作用于 district/空）
  // 例如 agent 或降级方案把"坊市"产成了 district，这里纠正为 market
  private static readonly NAME_TYPE_RULES: { match: string; type: string }[] = [
    { match: '坊市', type: 'market' },
    { match: '修炼室', type: 'cultivation' },
    { match: '冶炼坊', type: 'forging' },
    { match: '丹房', type: 'alchemy' },
  ];

  // 每个城市必须且只能各包含一个的核心功能地点（防 AI 生成"铁血佣兵公会"/"紫云丹阁"等同功能变体）
  // match: 判定某生成项是否属于该核心类别（按 loc_type 或名称关键字）
  private static readonly CITY_MANDATORY: {
    canonical: string; type: string; desc: string; match: (it: GeneratedLocation) => boolean;
  }[] = [
    { canonical: '坊市', type: 'market', desc: '城中最热闹的交易之地', match: (it) => it.loc_type === 'market' || it.name.includes('坊市') },
    { canonical: '佣兵公会', type: 'district', desc: '佣兵与散修接取委托的所在', match: (it) => it.name.includes('佣兵公会') },
    { canonical: '丹房', type: 'alchemy', desc: '城中炼药师炼制丹药之处', match: (it) => it.loc_type === 'alchemy' || it.name.includes('丹房') || it.name.includes('丹阁') || it.name.includes('药庐') },
  ];

  constructor(private readonly agentClient: AgentClient) {}

  /** 归一化 loc_type：仅对 district/空 做按名纠正，避免误伤 wild2/scene 等 */
  private normalizeTypes(items: GeneratedLocation[]): GeneratedLocation[] {
    return items.map((it) => {
      if (it.loc_type && it.loc_type !== 'district') return it;
      const rule = MapGeneratorService.NAME_TYPE_RULES.find((r) => it.name.includes(r.match));
      return rule ? { ...it, loc_type: rule.type } : it;
    });
  }

  /**
   * 城市核心功能地点保障：每个城市必须且只能各包含一个 坊市/佣兵公会/丹房。
   * - 若 AI 产出了某类的变体（如"铁血佣兵公会"、"紫云丹阁"），保留第一个并改名为标准名，丢弃其余变体；
   * - 若某类缺失，则补一个标准地点。
   * 匹配同时按 loc_type 与名称关键字，避免 AI 自设 loc_type 或用异名（丹阁/药庐）时漏判。
   * 仅在 depth=4 且父节点为 city 时调用。
   */
  private enforceCityMandatory(items: GeneratedLocation[], parent: Location): GeneratedLocation[] {
    const out: GeneratedLocation[] = [];
    const usedNames = new Set<string>();

    for (const m of MapGeneratorService.CITY_MANDATORY) {
      const variants = items.filter((it) => m.match(it));
      if (variants.length > 0) {
        // 保留首个变体并标准化为标准名/类型
        out.push({ ...variants[0], name: m.canonical, loc_type: m.type });
      } else {
        out.push({
          name: m.canonical,
          loc_type: m.type,
          description: `${m.canonical}，${m.desc}。`,
          danger_level: 0,
          qi_density: 0,
          available_actions: ['explore'],
          tags: ['核心功能'],
          seed: String(Math.floor(Math.random() * 10000)),
        });
      }
      usedNames.add(m.canonical);
    }

    // 补回 AI 生成的其余非冲突地点（命中任一核心类别或重名一律跳过）
    for (const it of items) {
      const isMandatoryVariant = MapGeneratorService.CITY_MANDATORY.some((m) => m.match(it));
      if (isMandatoryVariant || usedNames.has(it.name)) continue;
      usedNames.add(it.name);
      out.push(it);
    }
    return out;
  }

  async generate(input: GenerateInput): Promise<GeneratedLocation[]> {
    const { parent, rule, count, existingNames } = input;

    this.logger.log(`请求 agent 生成 [${parent.name}] 的 ${count} 个子节点...`);

    let items: GeneratedLocation[];
    try {
      const data = await this.agentClient.generateMap({
        parent: {
          id: parent.id,
          name: parent.name,
          loc_type: parent.loc_type,
          description: parent.description,
          depth: parent.depth,
        },
        rule: {
          depth: rule.depth,
          loc_type: rule.loc_type,
          gen_prompt: rule.gen_prompt,
          naming_style: rule.naming_style,
          danger_range: rule.danger_range,
          world_constraints: rule.world_constraints,
          min_children: rule.min_children,
          max_children: rule.max_children,
        },
        count,
        existingNames,
        seed: parent.seed,
      });

      items = data.map((item: any) => ({
        name: String(item.name || ''),
        loc_type: String(item.loc_type || 'district'),
        description: String(item.description || ''),
        danger_level: Number(item.danger_level || 0),
        qi_density: Number(item.qi_density || 0),
        available_actions: Array.isArray(item.available_actions) ? item.available_actions : null,
        tags: Array.isArray(item.tags) ? item.tags : null,
        seed: String(item.seed || ''),
        common_mobs: Array.isArray(item.common_mobs) ? item.common_mobs : null,
      }));
    } catch (err) {
      this.logger.error(`Agent 生成失败: ${(err as Error).message}，使用降级方案`);
      items = this.fallbackGenerate(parent, count);
    }

    items = this.normalizeTypes(items);
    // 城市核心功能保障：必含且仅各一个 坊市/佣兵公会/丹房
    if (rule.depth === 4 && parent.loc_type === 'city') {
      items = this.enforceCityMandatory(items, parent);
    }
    return items;
  }

  /** 降级方案：根据父节点类型生成合理的子地点 */
  private fallbackGenerate(parent: Location, count: number): GeneratedLocation[] {
    const depth = parent.depth + 1;
    const parentType = parent.loc_type;

    // 根据父节点类型和深度选择不同的名称池和类型
    let pool: string[];
    let locType: string;

    if (depth === 2) {
      // 区域 → 帝国
      pool = ['玄冰帝国', '赤焰帝国', '碧水帝国', '风雷帝国', '天星帝国', '紫月帝国', '苍龙帝国', '玄武帝国'];
      locType = 'empire';
    } else if (depth === 3) {
      // 帝国 → 城市/野外/宗派/秘境 混合
      const cityPool = ['云岚城', '黑岩城', '赤焰城', '碧水城', '风雷城'];
      const wildPool = ['魔兽山脉', '幽暗森林', '荒漠戈壁', '毒雾沼泽'];
      const sectPool = ['丹宗', '剑阁', '药王谷'];
      const secretPool = ['远古遗迹', '地下熔岩洞', '冰封密境'];
      pool = [...cityPool.slice(0, 2), ...wildPool.slice(0, 2), ...sectPool.slice(0, 1), ...secretPool.slice(0, 1)];
      locType = 'city'; // 将在下面逐个覆盖
    } else if (depth === 4) {
      if (parentType === 'wild') {
        pool = ['外围区域', '深处密林', '核心区', '隐秘洞穴'];
        locType = 'wild2';
      } else if (parentType === 'sect') {
        pool = ['外门', '内门', '藏经阁', '练功场'];
        locType = 'district';
      } else if (parentType === 'secret') {
        pool = ['前厅', '核心区域', '守护者区域', '宝物室'];
        locType = 'district';
      } else {
        // city 或其他
        pool = ['坊市', '佣兵公会', '修炼室', '冶炼坊', '丹房', '药材商行', '城主府', '修炼场'];
        locType = 'district';
      }
    } else {
      // depth >= 5
      pool = ['悬赏牌前', '炼药炉旁', '密林深处', '老者摊位', '溪谷'];
      locType = parentType === 'wild2' ? 'wild3' : 'scene';
    }

    const results: GeneratedLocation[] = [];
    for (let i = 0; i < count && i < pool.length; i++) {
      let itemLocType = locType;
      // depth===3 时混合类型
      if (depth === 3) {
        if (i < 2) itemLocType = 'city';
        else if (i < 4) itemLocType = 'wild';
        else if (i < 5) itemLocType = 'sect';
        else itemLocType = 'secret';
      }
      // 野外 danger_level 1-3, 非野外 0
      const isWildType = ['wild', 'wild2', 'wild3'].includes(itemLocType);
      const dangerLevel = isWildType
        ? Math.min(Math.max(Math.floor(Math.random() * 3) + 1, 1), 3)
        : 0;
      results.push({
        name: pool[i],
        loc_type: itemLocType,
        description: `${pool[i]}是${parent.name}附近的一处${itemLocType === 'city' ? '城市' : itemLocType === 'wild' ? '野外' : itemLocType === 'sect' ? '宗派' : '地点'}`,
        danger_level: dangerLevel,
        available_actions: ['explore'],
        tags: ['降级生成'],
        seed: String(Math.floor(Math.random() * 10000)),
      });
    }
    return results;
  }
}
