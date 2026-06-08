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

  /** 降级方案 */
  private fallbackGenerate(parent: Location, count: number): GeneratedLocation[] {
    const pool =
      parent.depth < 3
        ? ['云岚城', '黑岩城', '赤焰城', '碧水城', '风雷城', '天星城', '落雁城', '紫月城']
        : ['坊市', '佣兵公会', '药材商行', '城主府', '修炼场', '密林区', '溪谷', '山腰平台'];

    const results: GeneratedLocation[] = [];
    for (let i = 0; i < count && i < pool.length; i++) {
      results.push({
        name: pool[i],
        loc_type: parent.depth < 3 ? 'city' : 'district',
        description: `${pool[i]}是${parent.name}附近的一处地点`,
        danger_level: Math.floor(Math.random() * 5) + 1,
        available_actions: ['explore'],
        tags: ['降级生成'],
        seed: String(Math.floor(Math.random() * 10000)),
      });
    }
    return results;
  }
}
