import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from './location.entity';
import { LocationGenRule } from './location-gen-rule.entity';
import { CreateLocationDto, ExpandLocationDto } from './dto/location.dto';
import { MapGeneratorService } from './map-generator.service';
import { MobService } from '../mob/mob.service';

@Injectable()
export class LocationService {
  private readonly logger = new Logger(LocationService.name);

  constructor(
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(LocationGenRule)
    private readonly ruleRepo: Repository<LocationGenRule>,
    private readonly mapGenerator: MapGeneratorService,
    private readonly mobService: MobService,
  ) {}

  /** 查询某个节点的子节点（如果未展开则自动触发生成）
   *  当父节点为 empire 时，递归展开所有后代（一次性生成完整子树）
   */
  async getChildren(locationId: number): Promise<Location[]> {
    const parent = await this.locationRepo.findOneBy({ id: locationId });
    if (!parent) throw new NotFoundException(`地点 ${locationId} 不存在`);

    // wild3 是最深层野外，不可再展开
    const isMaxWild = parent.loc_type === 'wild3';

    if (!parent.is_expanded && parent.depth < 5 && !isMaxWild) {
      await this.expandNode(parent);

      // empire 类型：递归展开所有后代
      if (parent.loc_type === 'empire') {
        await this.expandAllDescendants(locationId);
      }
    }

    return this.locationRepo.find({
      where: { parent_id: locationId },
      order: { id: 'ASC' },
    });
  }

  /** 展开：AI 生成子节点 */
  async expandNode(parent: Location): Promise<Location[]> {
    const childDepth = parent.depth + 1;
    const isWildParent = parent.loc_type === 'wild';
    const isWild2Parent = parent.loc_type === 'wild2';

    // 查找匹配的生成规则
    const rules = await this.ruleRepo.find({ where: { depth: childDepth } });
    if (rules.length === 0) {
      this.logger.warn(`depth=${childDepth} 没有生成规则，跳过`);
      return [];
    }
    const rule = rules[0];

    // 随机决定生成数量
    const count =
      Math.floor(Math.random() * (rule.max_children - rule.min_children + 1)) +
      rule.min_children;

    // 查已有子节点（防止重名）
    const existing = await this.locationRepo.find({
      where: { parent_id: parent.id },
    });
    const existingNames = existing.map((e) => e.name);

    // 调用 AI 生成
    const generated = await this.mapGenerator.generate({
      parent,
      rule,
      count,
      existingNames,
    });

    // 查找父级 wild 的 common_mobs 和 danger_level（用于 wild2/wild3 继承）
    let parentWildMobs: string | null = null;
    let parentWildDanger: number = 0;
    if (isWildParent && parent.common_mobs) {
      parentWildMobs = parent.common_mobs;
      parentWildDanger = parent.danger_level || 0;
    } else if (isWild2Parent) {
      // wild2 的父级一定是 wild，往上找
      const grandParent = parent.parent_id
        ? await this.locationRepo.findOneBy({ id: parent.parent_id })
        : null;
      if (grandParent?.common_mobs) {
        parentWildMobs = grandParent.common_mobs;
        parentWildDanger = grandParent.danger_level || 0;
      }
    }

    // 批量写入数据库
    const children: Location[] = [];
    for (const item of generated) {
      const loc = new Location();
      loc.name = item.name;

      // 野外类型强制覆盖 loc_type
      if (isWildParent) {
        loc.loc_type = 'wild2';
      } else if (isWild2Parent) {
        loc.loc_type = 'wild3';
      } else {
        loc.loc_type = item.loc_type || rule.loc_type;
      }

      loc.description = item.description || null;
      loc.depth = childDepth;
      // 野外类型：danger_level 继承父级 wild
      if ((isWildParent || isWild2Parent) && parentWildDanger > 0) {
        loc.danger_level = parentWildDanger;
      } else if (loc.loc_type === 'wild' || loc.loc_type === 'wild2' || loc.loc_type === 'wild3') {
        // wild 类型但无法继承时，clamp 1-3
        loc.danger_level = Math.max(1, Math.min(item.danger_level ?? 1, 3));
      } else {
        loc.danger_level = 0;
      }
      loc.qi_density = item.qi_density ?? 0;
      loc.is_fixed = 0;
      loc.is_expanded = 0;
      loc.parent_id = parent.id;
      loc.available_actions = item.available_actions || null;
      loc.tags = item.tags || null;
      loc.seed = item.seed || String(Math.floor(Math.random() * 10000));

      // wild 类型：AI 返回的 common_mobs
      if (item.common_mobs && item.common_mobs.length > 0) {
        loc.common_mobs = JSON.stringify(item.common_mobs);
        await this.mobService.findOrCreateBatch(
          item.common_mobs.map((m) => ({ mob_id: m.mob_id, name: m.name })),
        );
      }
      // wild2/wild3：继承父级 wild 的 common_mobs
      else if (parentWildMobs) {
        loc.common_mobs = parentWildMobs;
      }

      const saved = await this.locationRepo.save(loc);
      children.push(saved);
    }

    // 标记父节点已展开
    parent.is_expanded = 1;
    await this.locationRepo.save(parent);

    this.logger.log(`展开 [${parent.name}] 生成了 ${children.length} 个子节点`);
    return children;
  }

  /** 递归展开某个节点的所有未展开后代（BFS逐层展开） */
  private async expandAllDescendants(rootId: number): Promise<void> {
    // BFS：逐层找到未展开的节点并展开
    let queue = [rootId];
    while (queue.length > 0) {
      // 查找当前层所有子节点
      const children = await this.locationRepo
        .createQueryBuilder('loc')
        .where('loc.parent_id IN (:...ids)', { ids: queue })
        .getMany();

      if (children.length === 0) break;

      // 找出未展开的节点
      const unexpanded = children.filter(
        (c) => !c.is_expanded && c.depth < 5 && c.loc_type !== 'wild3',
      );

      queue = [];

      // 逐个展开（需要按顺序，因为每层依赖上一层的 parent 数据）
      for (const node of unexpanded) {
        try {
          await this.expandNode(node);
          // 收集新展开节点的 ID，作为下一层的 parent
          const newChildren = await this.locationRepo.find({
            where: { parent_id: node.id },
          });
          queue.push(...newChildren.map((c) => c.id));
        } catch (err) {
          this.logger.error(`展开 [${node.name}] 失败: ${err.message}`);
        }
      }

      // 已展开的节点其子节点也需要加入下一轮
      const expandedWithChildren = children.filter(
        (c) => c.is_expanded && !unexpanded.includes(c),
      );
      for (const node of expandedWithChildren) {
        const existingChildren = await this.locationRepo.find({
          where: { parent_id: node.id },
        });
        queue.push(...existingChildren.map((c) => c.id));
      }
    }
    this.logger.log(`[expandAllDescendants] empire 子树全部展开完成`);
  }

  /** 获取节点详情 */
  async findOne(id: number): Promise<Location> {
    const loc = await this.locationRepo.findOneBy({ id });
    if (!loc) throw new NotFoundException(`地点 ${id} 不存在`);
    return loc;
  }

  /** 获取节点详情（不存在返回 null，不抛异常） */
  async findOneOrNull(id: number): Promise<Location | null> {
    return this.locationRepo.findOneBy({ id });
  }

  /** 获取整棵子树 */
  async getTree(id: number): Promise<any> {
    const parent = await this.findOne(id);
    const children = await this.locationRepo.find({
      where: { parent_id: id },
    });
    const result: any = { ...parent, children: [] };
    for (const child of children) {
      if (child.is_expanded) {
        result.children.push(await this.getTree(child.id));
      } else {
        result.children.push(child);
      }
    }
    return result;
  }

  /** 手动创建地点 */
  async create(dto: CreateLocationDto): Promise<Location> {
    const loc = this.locationRepo.create(dto);
    return this.locationRepo.save(loc);
  }

  /** 查所有根节点 */
  async getRoots(): Promise<Location[]> {
    return this.locationRepo.createQueryBuilder('loc')
      .where('loc.parent_id IS NULL')
      .getMany();
  }
}
