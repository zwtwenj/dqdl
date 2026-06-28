import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaticNpc } from './static-npc.entity';
import { Nature } from './nature.entity';
import { NpcRole } from './npc-role.entity';
import { DialogEvent } from './dialog-event.entity';
import { Location } from '../location/location.entity';
import { LocationService } from '../location/location.service';
import { CreateNpcDto } from './dto/npc.dto';
import { AgentClient } from '../agent/agent.client';

@Injectable()
export class NpcService {
  private readonly logger = new Logger(NpcService.name);

  constructor(
    @InjectRepository(StaticNpc)
    private readonly npcRepo: Repository<StaticNpc>,
    @InjectRepository(Nature)
    private readonly natureRepo: Repository<Nature>,
    @InjectRepository(NpcRole)
    private readonly roleRepo: Repository<NpcRole>,
    @InjectRepository(DialogEvent)
    private readonly eventRepo: Repository<DialogEvent>,
    private readonly locationService: LocationService,
    private readonly agentClient: AgentClient,
  ) {}

  /** 查询某个地点的所有 NPC */
  async findByLocation(locationId: number): Promise<any[]> {
    const npcs = await this.npcRepo.find({
      where: { location_id: locationId },
    });
    // 附带性格、职能和对话事件
    const result = [];
    for (const npc of npcs) {
      const nature = await this.natureRepo.findOneBy({ id: npc.nature_id });
      const role = await this.roleRepo.findOneBy({ id: npc.role_id });
      const events = role ? await this.eventRepo.find({ where: { role_id: role.id } }) : [];
      result.push({
        ...npc,
        nature_name: nature?.name || '',
        nature_hint: nature?.prompt_hint || '',
        role_name: role?.name || '',
        role_hint: role?.prompt_hint || '',
        dialog_events: events.map(e => ({ id: e.id, text: e.text, event: e.event })),
      });
    }
    return result;
  }

  /** 为某个地点自动生成 NPC（根据 loc_type 匹配 required_in_loc_type） */
  async generateNpcsForLocation(locationId: number): Promise<StaticNpc[]> {
    const location = await this.locationService.findOneOrNull(locationId);
    if (!location) return [];

    // 野外类型不生成静态NPC
    if (['wild', 'wild2', 'wild3'].includes(location.loc_type)) return [];

    // 检查是否已生成过
    const existing = await this.npcRepo.find({ where: { location_id: locationId } });
    if (existing.length > 0) return existing;

    // 找到匹配的职能（匹配 loc_type 或 name 包含关键词）
    const allRoles = await this.roleRepo.find();
    const matchedRoles = allRoles.filter((r) => {
      if (!r.required_in_loc_type) return false;
      try {
        // TEXT 字段可能是字符串，需要 parse
        const keywords: string[] = typeof r.required_in_loc_type === 'string'
          ? JSON.parse(r.required_in_loc_type as unknown as string)
          : r.required_in_loc_type;
        const match = keywords.some(
          (keyword) => location.loc_type === keyword || location.name.includes(keyword),
        );
        return match;
      } catch (e) {
        this.logger.warn(`职能[${r.name}] JSON解析失败: ${r.required_in_loc_type}`);
        return false;
      }
    });

    if (matchedRoles.length === 0) return [];

    // 获取所有性格
    const allNatures = await this.natureRepo.find();
    if (allNatures.length === 0) return [];

    const npcs: StaticNpc[] = [];
    for (const role of matchedRoles) {
      // 随机选一个性格
      const nature = allNatures[Math.floor(Math.random() * allNatures.length)];

      const npc = new StaticNpc();
      npc.name = this.generateNpcName(role.name, nature.name);
      npc.gender = Math.random() < 0.6 ? '男' : '女';
      npc.age = this.randomAge();
      npc.nature_id = nature.id;
      npc.role_id = role.id;
      npc.location_id = locationId;
      npc.greeting = null;

      const saved = await this.npcRepo.save(npc);
      npcs.push(saved);
    }

    this.logger.log(`为 [${location.name}] 生成了 ${npcs.length} 个NPC`);
    return npcs;
  }

  /** 获取地点信息 */
  async getLocation(locationId: number): Promise<Location | null> {
    return this.locationService.findOneOrNull(locationId);
  }

  /** 取某地点下首个 NPC（原始数据，任务交付点解析用） */
  async findOneRawByLocation(locationId: number): Promise<StaticNpc | null> {
    return this.npcRepo.findOneBy({ location_id: locationId });
  }

  /** 随机年龄段 */
  private randomAge(): string {
    const ages = ['少年', '青年', '中年', '老年'];
    return ages[Math.floor(Math.random() * ages.length)];
  }

  /** 生成 NPC 名字（简单规则） */
  private generateNpcName(roleName: string, natureName: string): string {
    const surnames = ['王', '李', '张', '刘', '陈', '赵', '周', '孙', '吴', '郑', '冯', '卫', '蒋', '沈', '韩', '杨'];
    const suffixes: Record<string, string[]> = {
      '公会接待员': ['大叔', '大姐', '小哥', '婶子'],
      '坊市管理员': ['掌柜', '老板', '管事'],
      '拍卖师': ['先生', '女士'],
      '炼药师': ['药师', '老先生'],
      '铁匠': ['师傅', '大叔'],
      '锻造师': ['师傅', '大叔', '大师'],
      '药材商': ['掌柜', '老板娘'],
      '旅馆老板': ['掌柜', '大娘'],
      '修炼场教官': ['教头', '师傅'],
      '修炼室管理员': ['执事', '管事'],
    };

    const surname = surnames[Math.floor(Math.random() * surnames.length)];
    const suf = suffixes[roleName]
      ? suffixes[roleName][Math.floor(Math.random() * suffixes[roleName].length)]
      : '';

    return `${surname}${suf}`;
  }

  /** 手动创建 NPC */
  async create(dto: CreateNpcDto): Promise<StaticNpc> {
    const npc = this.npcRepo.create(dto);
    return this.npcRepo.save(npc);
  }

  /** 获取 NPC 详情（含性格、职能） */
  async findOne(id: number): Promise<any> {
    const npc = await this.npcRepo.findOneBy({ id });
    if (!npc) return null;
    const nature = await this.natureRepo.findOneBy({ id: npc.nature_id });
    const role = await this.roleRepo.findOneBy({ id: npc.role_id });
    return {
      ...npc,
      nature_name: nature?.name || '',
      nature_hint: nature?.prompt_hint || '',
      role_name: role?.name || '',
      role_hint: role?.prompt_hint || '',
    };
  }

  /** 与 NPC 对话：调用 agent 生成回复（Controller 不再直接接触 HTTP） */
  async talk(id: number, message: string, history: any[]): Promise<any> {
    const npc = await this.findOne(id);
    if (!npc) return { reply: '此人已不在原地。' };

    const location = await this.getLocation(npc.location_id);
    return this.agentClient.generateDialog({
      npc: {
        name: npc.name,
        nature_name: npc.nature_name,
        nature_hint: npc.nature_hint,
        role_name: npc.role_name,
        role_hint: npc.role_hint,
      },
      location: {
        name: location?.name || '',
        loc_type: location?.loc_type || '',
        description: location?.description || '',
        tags: location?.tags || [],
      },
      player_input: message || '',
      history: history || [],
    });
  }
}
