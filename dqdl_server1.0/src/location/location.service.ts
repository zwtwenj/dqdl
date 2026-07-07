import { Injectable, NotFoundException, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Location } from './location.entity';

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
    if (!loc) throw new NotFoundException(`地点 ${locationId} 不存在`)
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
}
