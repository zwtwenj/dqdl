import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from './location.entity';
import { LocationGenRule } from './location-gen-rule.entity';
import { Biz } from '../common/biz.exception';
import { AgentService } from '../agent/agent.service';
import type { AgentMapResult } from '../agent/agent.types';

/**
 * 地点服务（网游模式）：管理全局唯一地图树，所有角色共享。
 *
 * 服务启动时检查地图是否已初始化（init.sql 已种入固定种子），
 * 若为空则用固定种子补建（双保险）。后续接入 AI 懒生成时，
 * expandNode 方法复用同一张表。
 */
@Injectable()
export class LocationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    @InjectRepository(Location)
    private readonly repo: Repository<Location>,
    @InjectRepository(LocationGenRule)
    private readonly ruleRepo: Repository<LocationGenRule>,
    private readonly agent: AgentService,
  ) {}

  /** 启动时确保全局地图已初始化（init.sql 已种的兜底） */
  async onApplicationBootstrap() {
    const count = await this.repo.count()
    if (count === 0) {
      this.logger.warn('地图表为空，用固定种子初始化全局地图...')
      await this.seedFixedMap()
      this.logger.log('✅ 全局地图初始化完成')
    } else {
      this.logger.log(`地图已存在（${count} 个节点）`)
    }
  }

  /** 查询某节点的子节点 */
  async getChildren(locationId: number): Promise<Location[]> {
    await this.findOne(locationId)
    return this.repo.find({
      where: { parent_id: locationId },
      order: { id: 'ASC' },
    })
  }

  /** 查询单个节点 */
  async findOne(locationId: number): Promise<Location> {
    const loc = await this.repo.findOneBy({ id: locationId })
    if (!loc) throw Biz.notFound(`地点 ${locationId} 不存在`)
    return loc
  }

  /** 查询根节点（斗气大陆） */
  async getRoot(): Promise<Location | null> {
    return this.repo.findOneBy({ depth: 0 })
  }

  /** 固定种子：斗气大陆 + 4 区域（init.sql 也会种，这里是代码级兜底） */
  private async seedFixedMap(): Promise<void> {
    const root = this.repo.create({
      name: '斗气大陆',
      loc_type: 'continent',
      description: '斗气大陆，强者为尊的世界',
      depth: 0,
      danger_level: 0,
      is_fixed: 1,
      is_expanded: 1,
      parent_id: null,
    })
    const savedRoot = await this.repo.save(root)

    const regions = [
      { name: '西北区域', description: '斗气大陆西北方，位置偏僻但势力盘根错节', danger_level: 0, tags: null },
      { name: '中州', description: '斗气大陆最繁华的核心区域，强者云集', danger_level: 0, tags: null },
      { name: '黑角域', description: '斗气大陆最混乱的三不管地带', danger_level: 3, tags: ['混乱', '高危'] },
      { name: '隐秘空间界', description: '远古八族等顶级势力隐居的独立空间', danger_level: 5, tags: ['神秘', '顶级势力'] },
    ]
    for (const r of regions) {
      await this.repo.save(
        this.repo.create({
          ...r,
          loc_type: 'region',
          depth: 1,
          is_fixed: 1,
          is_expanded: 0,
          parent_id: savedRoot.id,
        }),
      )
    }
  }

  /** 按子节点深度查生成规则（父节点 depth+1 = rule.depth） */
  async getRuleByDepth(childDepth: number): Promise<LocationGenRule | null> {
    return this.ruleRepo.findOneBy({ depth: childDepth });
  }

  /**
   * 展开某节点的子节点（懒生成）。
   * 1. 校验父节点存在且未展开
   * 2. 按 depth 查生成规则
   * 3. 调 agent 生成；agent 失败走 fallback
   * 4. 批量入库，置父节点 is_expanded=1
   * 返回生成的子节点列表。
   */
  async expandNode(locationId: number): Promise<Location[]> {
    const parent = await this.findOne(locationId);
    if (parent.is_expanded === 1) {
      throw Biz.conflict(`地点 ${parent.name} 的子节点已生成`)
    }

    const childDepth = parent.depth + 1
    const rule = await this.getRuleByDepth(childDepth)
    const count = rule
      ? this.randInt(rule.min_children, rule.max_children)
      : 3
    const existing = await this.repo.find({
      where: { parent_id: locationId },
      select: ['name'],
    })
    const existingNames = existing.map((e) => e.name)

    let results: AgentMapResult[] | null = null
    if (rule) {
      results = await this.agent.generateMap(
        {
          id: parent.id,
          name: parent.name,
          loc_type: parent.loc_type,
          description: parent.description,
          depth: parent.depth,
        },
        {
          depth: rule.depth,
          loc_type: rule.loc_type,
          min_children: rule.min_children,
          max_children: rule.max_children,
          naming_style: rule.naming_style,
          danger_range: rule.danger_range,
          world_constraints: rule.world_constraints,
          gen_prompt: rule.gen_prompt,
        },
        count,
        existingNames,
      )
    }

    const finalResults = results ?? this.fallbackGenerate(parent, count)

    const children = finalResults.map((r) =>
      this.repo.create({
        name: r.name || '未知地点',
        loc_type: this.normalizeType(r.loc_type || (rule?.loc_type ?? 'district')),
        description: r.description || null,
        depth: childDepth,
        danger_level: r.danger_level ?? 0,
        qi_density: r.qi_density ?? 0,
        is_fixed: 0,
        is_expanded: 0,
        available_actions: r.available_actions ?? null,
        tags: r.tags ?? null,
        common_mobs: r.common_mobs ? JSON.stringify(r.common_mobs) : null,
        common_herbs: r.common_herbs ? JSON.stringify(r.common_herbs) : null,
        parent_id: parent.id,
      }),
    )
    const saved = await this.repo.save(children)

    parent.is_expanded = 1
    await this.repo.save(parent)

    this.logger.log(
      `✅ 展开地点 ${parent.name}：${saved.length} 个子节点（${results ? 'agent' : 'fallback'}）`,
    )
    return saved
  }

  /** agent 不可用时的降级方案：用内置名称池生成 */
  private fallbackGenerate(
    parent: Location,
    count: number,
  ): AgentMapResult[] {
    const pool =
      parent.depth < 3
        ? ['云岚城', '黑岩城', '赤焰城', '碧水城', '风雷城', '天星城', '落雁城', '紫月城']
        : ['坊市', '佣兵公会', '修炼室', '药材商行', '城主府', '修炼场', '密林区', '溪谷']
    const results: AgentMapResult[] = []
    for (let i = 0; i < Math.min(count, pool.length); i++) {
      results.push({
        name: pool[i],
        loc_type: parent.depth < 3 ? 'city' : 'district',
        description: `${pool[i]}是${parent.name}附近的一处地点`,
        danger_level: 0,
        qi_density: 0,
        available_actions: ['explore'],
        tags: null,
        common_mobs: null,
        common_herbs: null,
      })
    }
    return results
  }

  /** 按 name 归一化 loc_type（参照旧项目 MapGeneratorService） */
  private normalizeType(rawType: string): string {
    const t = rawType.toLowerCase()
    if (['market', '坊市'].includes(t)) return 'market'
    if (['cultivation', '修炼室', '修炼场'].includes(t)) return 'cultivation'
    if (['forging', '冶炼坊', '锻造坊'].includes(t)) return 'forging'
    if (['alchemy', '丹房'].includes(t)) return 'alchemy'
    return rawType
  }

  /** [min, max] 闭区间随机整数 */
  private randInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }
}
