import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Location } from './location.entity';
import { LocationGenRule } from './location-gen-rule.entity';

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
  private readonly agentUrl: string;

  constructor(private readonly config: ConfigService) {
    this.agentUrl = this.config.get<string>('AGENT_URL') || 'http://localhost:5000';
  }

  async generate(input: GenerateInput): Promise<GeneratedLocation[]> {
    const { parent, rule, count, existingNames } = input;

    this.logger.log(`请求 agent 生成 [${parent.name}] 的 ${count} 个子节点...`);

    try {
      const response = await fetch(`${this.agentUrl}/generate/map`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      });

      if (!response.ok) {
        throw new Error(`Agent 返回 ${response.status}`);
      }

      const data = await response.json() as any[];

      return data.map((item: any) => ({
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
      this.logger.error(`Agent 生成失败: ${err.message}，使用降级方案`);
      return this.fallbackGenerate(parent, count);
    }
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
        pool = ['坊市', '佣兵公会', '药材商行', '城主府', '修炼场'];
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
