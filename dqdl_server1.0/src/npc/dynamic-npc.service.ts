import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { DynamicNpc } from './dynamic-npc.entity';
import { Nature } from './nature.entity';
import { NpcRole } from './npc-role.entity';
import { AgentService } from '../agent/agent.service';
import { Biz } from '../common/biz.exception';

/** 单个职业（role_id）下 dynamic_npc 数量上限，防 Agent 无限造词 */
const MAX_NPC_PER_ROLE = 20;

/** acquire 入参 */
export interface AcquireActorDto {
  role_name: string; // 必填：职业/职能名
  nature?: string; // 可选：指定性格名
  loc_net_id?: number; // 可选：希望出现的节点 id
  loc_scene_id?: number; // 可选：希望出现的场景 id
  scene_name?: string; // 喂 agent 用
  scene_type?: string;
  city_name?: string;
  ref_type?: string; // 来源追溯
  ref_id?: number;
  prefer_existing?: boolean; // 默认 true：优先复用池中已启用演员
  description?: string; // 可选：人物描述（新建时写入）
}

/**
 * 动态 NPC 演员池服务。
 *
 * 核心能力：
 *  - acquire：查找或创建演员（Agent/剧情选角单入口，prefer_existing 默认复用）
 *  - ensureRole：查找或创建职业（npc_role.category='profession'），赋予 Agent 造职业能力
 *  - 启停/移动/状态变更/列表查询
 *  - findByLocation：该地点可见的动态演员（含游荡演员）
 *
 * 与 NpcService 的关系：本服务专注动态演员池；NpcService.findByLocation 负责
 * 把 static + dynamic 合并成 { static, dynamic } 返回给前端（调用本服务的 findByLocation）。
 */
@Injectable()
export class DynamicNpcService {
  private readonly logger = new Logger(DynamicNpcService.name);

  constructor(
    @InjectRepository(DynamicNpc)
    private readonly repo: Repository<DynamicNpc>,
    @InjectRepository(Nature)
    private readonly natureRepo: Repository<Nature>,
    @InjectRepository(NpcRole)
    private readonly roleRepo: Repository<NpcRole>,
    private readonly agent: AgentService,
  ) {}

  // ============================================================
  //  acquire：查找或创建演员（Agent 选角单接口）
  // ============================================================

  /**
   * 查找或创建一个动态演员。
   *
   * 算法：
   *  1. ensureRole(role_name) 拿到 role_id（不存在则建 profession）
   *  2. prefer_existing=true 时，按 role+enabled+alive + 位置匹配(或游荡) 命中一条即复用
   *  3. 未命中 → 校验该 role 下数量 < 20 → 调 agent.generateNpc 生成 → 兜底随机 → 入库
   *
   * @returns { ...演员信息, is_new: boolean }
   */
  async acquire(dto: AcquireActorDto): Promise<any> {
    const preferExisting = dto.prefer_existing !== false; // 默认 true
    const roleName = (dto.role_name || '').trim();
    if (!roleName) throw Biz.badRequest('role_name 不能为空');

    // 1. 确保 role 存在
    const role = await this.ensureRole(roleName);

    // 2. 优先复用
    if (preferExisting) {
      const hit = await this.pickExistingActor(role.id, dto.loc_net_id, dto.loc_scene_id);
      if (hit) {
        this.logger.log(`acquire 复用演员：${hit.name}（${roleName}#${hit.id}）`);
        return this.toAcquireResult(hit, role, false);
      }
    }

    // 3. 创建：先限额
    const count = await this.repo.count({ where: { role_id: role.id } });
    if (count >= MAX_NPC_PER_ROLE) {
      throw Biz.conflict(`职业「${roleName}」演员已达上限(${MAX_NPC_PER_ROLE})`);
    }

    const created = await this.spawnActor(role, dto);
    this.logger.log(`acquire 新建演员：${created.name}（${roleName}#${created.id}）`);
    return this.toAcquireResult(created, role, true);
  }

  /**
   * 从池中挑一条可复用演员：role 匹配 + 启用 + 存活 + 位置匹配(或游荡)。
   * 同 role 多条时取最近创建的（LIMIT 1 ORDER BY id DESC）。
   * 位置匹配规则：
   *   - 传了 loc_net_id  → location_net_id = loc_net_id 或 游荡(两列皆空)
   *   - 传了 loc_scene_id → location_scene_id = loc_scene_id 或 游荡
   *   - 都没传           → 任意(含游荡与定点)
   */
  private async pickExistingActor(
    roleId: number,
    locNetId?: number,
    locSceneId?: number,
  ): Promise<DynamicNpc | null> {
    const qb = this.repo
      .createQueryBuilder('d')
      .where('d.role_id = :roleId', { roleId })
      .andWhere('d.enabled = 1')
      .andWhere('d.status = :alive', { alive: 'alive' })
      .orderBy('d.id', 'DESC')
      .take(1);

    if (locNetId != null) {
      qb.andWhere('(d.location_net_id = :netId OR (d.location_net_id IS NULL AND d.location_scene_id IS NULL))', {
        netId: locNetId,
      });
    } else if (locSceneId != null) {
      qb.andWhere(
        '(d.location_scene_id = :sceneId OR (d.location_net_id IS NULL AND d.location_scene_id IS NULL))',
        { sceneId: locSceneId },
      );
    }
    return qb.getOne();
  }

  /**
   * 调 agent 生成演员设定 + 兜底随机 + 入库。
   */
  private async spawnActor(role: NpcRole, dto: AcquireActorDto): Promise<DynamicNpc> {
    let name = '';
    let gender = '';
    let age = '';
    let natureName = dto.nature || '';

    const agentResult = await this.agent.generateNpc({
      scene_name: dto.scene_name || '',
      scene_type: dto.scene_type || '',
      role_name: role.name,
      role_hint: role.prompt_hint,
      city_name: dto.city_name,
    });
    if (agentResult) {
      name = agentResult.name || '';
      gender = agentResult.gender || '';
      age = agentResult.age || '';
      if (!natureName) natureName = agentResult.nature || '';
    }

    // 兜底：agent 没给全的字段随机补齐
    if (!name) name = this.randomName(gender === '女');
    if (!gender) gender = Math.random() < 0.5 ? '男' : '女';
    if (!age) age = this.AGE_POOL[Math.floor(Math.random() * this.AGE_POOL.length)];

    // 性格对齐 nature 表：找不到则随机取一个
    let nature = natureName ? await this.natureRepo.findOneBy({ name: natureName }) : null;
    if (!nature) {
      const all = await this.natureRepo.find();
      nature = all[Math.floor(Math.random() * all.length)] || null;
    }

    return this.repo.save(
      this.repo.create({
        name,
        gender,
        age,
        nature_id: nature?.id ?? 1,
        role_id: role.id,
        description: dto.description || null,
        enabled: 1,
        status: 'alive',
        location_net_id: dto.loc_net_id ?? null,
        location_scene_id: dto.loc_scene_id ?? null,
        source: 'agent',
        ref_type: dto.ref_type || null,
        ref_id: dto.ref_id ?? null,
      }),
    );
  }

  /** acquire 统一返回结构 */
  private async toAcquireResult(npc: DynamicNpc, role: NpcRole, isNew: boolean): Promise<any> {
    const nature = await this.natureRepo.findOneBy({ id: npc.nature_id });
    return {
      id: npc.id,
      name: npc.name,
      gender: npc.gender,
      age: npc.age,
      nature_id: npc.nature_id,
      nature_name: nature?.name || '',
      role_id: npc.role_id,
      role_name: role.name,
      role_hint: role.prompt_hint,
      description: npc.description,
      location_net_id: npc.location_net_id,
      location_scene_id: npc.location_scene_id,
      enabled: npc.enabled,
      status: npc.status,
      is_new: isNew,
    };
  }

  // ============================================================
  //  ensureRole：查找或创建职业（赋予 Agent 造职业能力）
  // ============================================================

  /**
   * 按名查找 npc_role；不存在则插入一条 category='profession', is_system=0。
   * npc_role.name 有 UNIQUE 约束，并发创建由 DB 兜底去重（重复时抛唯一键冲突，
   * 这里捕获后重新查询返回）。
   */
  async ensureRole(name: string, promptHint?: string): Promise<NpcRole> {
    const trimmed = (name || '').trim();
    if (!trimmed) throw Biz.badRequest('role name 不能为空');
    const exist = await this.roleRepo.findOneBy({ name: trimmed });
    if (exist) return exist;
    try {
      const saved = await this.roleRepo.save(
        this.roleRepo.create({
          name: trimmed,
          category: 'profession',
          is_system: 0,
          prompt_hint: promptHint || `动态职业：${trimmed}`,
          required_in_loc_type: null,
        }),
      );
      this.logger.log(`ensureRole 新建职业：${trimmed}#${saved.id}`);
      return saved;
    } catch (e) {
      // 并发场景：UNIQUE 冲突 → 重新查一次
      const again = await this.roleRepo.findOneBy({ name: trimmed });
      if (again) return again;
      throw e;
    }
  }

  // ============================================================
  //  地点可见演员（供 NpcService.findByLocation 合并返回）
  // ============================================================

  /**
   * 某地点可见的动态演员：enabled=1 AND status='alive'
   *   且（位置 = 该地点对应列  OR  游荡：两列皆空）。
   * @param locationId 地点 id
   * @param type       'node'=节点(查 location_net_id); 'scene'=场景(查 location_scene_id)
   */
  async findByLocation(locationId: number, type: 'node' | 'scene' = 'node'): Promise<any[]> {
    const col = type === 'scene' ? 'location_scene_id' : 'location_net_id';
    const qb = this.repo
      .createQueryBuilder('d')
      .where('d.enabled = 1')
      .andWhere('d.status = :alive', { alive: 'alive' })
      .andWhere(`(d.${col} = :locId OR (d.location_net_id IS NULL AND d.location_scene_id IS NULL))`, {
        locId: locationId,
      })
      .orderBy('d.id', 'ASC');

    const npcs = await qb.getMany();
    const result: any[] = [];
    for (const npc of npcs) {
      const [nature, role] = await Promise.all([
        this.natureRepo.findOneBy({ id: npc.nature_id }),
        this.roleRepo.findOneBy({ id: npc.role_id }),
      ]);
      result.push({
        ...npc,
        nature_name: nature?.name || '',
        nature_hint: nature?.prompt_hint || '',
        role_name: role?.name || '',
        role_hint: role?.prompt_hint || '',
      });
    }
    return result;
  }

  // ============================================================
  //  CRUD / 启停 / 移动 / 列表
  // ============================================================

  /** 详情（含 nature/role 文案） */
  async findOne(id: number): Promise<any> {
    const npc = await this.repo.findOneBy({ id });
    if (!npc) throw Biz.notFound(`动态NPC ${id} 不存在`);
    const [nature, role] = await Promise.all([
      this.natureRepo.findOneBy({ id: npc.nature_id }),
      this.roleRepo.findOneBy({ id: npc.role_id }),
    ]);
    return {
      ...npc,
      nature_name: nature?.name || '',
      nature_hint: nature?.prompt_hint || '',
      role_name: role?.name || '',
      role_hint: role?.prompt_hint || '',
    };
  }

  /** 取原始记录（不拼文案），供 NpcService.buildNpcDetail 统一拼装 static/dynamic 详情用。
   *  不存在返回 null（由调用方决定抛 notFound）。 */
  async findRawOne(id: number): Promise<DynamicNpc | null> {
    return this.repo.findOneBy({ id });
  }

  /** 列表（分页 + 过滤） */
  async list(params: {
    role_id?: number;
    enabled?: number;
    status?: string;
    net_id?: number;
    scene_id?: number;
    page?: number;
    size?: number;
  }): Promise<{ items: any[]; total: number; page: number; size: number }> {
    const page = Math.max(1, params.page ?? 1);
    const size = Math.min(100, Math.max(1, params.size ?? 20));

    const qb = this.repo.createQueryBuilder('d');
    if (params.role_id != null) qb.andWhere('d.role_id = :roleId', { roleId: params.role_id });
    if (params.enabled != null) qb.andWhere('d.enabled = :en', { en: params.enabled });
    if (params.status) qb.andWhere('d.status = :st', { st: params.status });
    if (params.net_id != null) qb.andWhere('d.location_net_id = :netId', { netId: params.net_id });
    if (params.scene_id != null) qb.andWhere('d.location_scene_id = :sid', { sid: params.scene_id });
    qb.orderBy('d.id', 'DESC').skip((page - 1) * size).take(size);

    const [rows, total] = await qb.getManyAndCount();
    // 批量补 nature/role 文案（避免 N+1：先聚合 id 再一次查）
    const natureIds = [...new Set(rows.map((r) => r.nature_id))];
    const roleIds = [...new Set(rows.map((r) => r.role_id))];
    const natures = natureIds.length
      ? await this.natureRepo.find({ where: { id: In(natureIds) } })
      : [];
    const roles = roleIds.length ? await this.roleRepo.find({ where: { id: In(roleIds) } }) : [];
    const natMap = new Map(natures.map((n) => [n.id, n]));
    const roleMap = new Map(roles.map((r) => [r.id, r]));

    const items = rows.map((npc) => {
      const nature = natMap.get(npc.nature_id);
      const role = roleMap.get(npc.role_id);
      return {
        ...npc,
        nature_name: nature?.name || '',
        nature_hint: nature?.prompt_hint || '',
        role_name: role?.name || '',
        role_hint: role?.prompt_hint || '',
      };
    });
    return { items, total, page, size };
  }

  /**
   * 更新演员：启停 / 状态 / 移动 / 描述。
   * 只更新传入的字段。
   */
  async update(
    id: number,
    patch: {
      enabled?: number;
      status?: string;
      location_net_id?: number | null;
      location_scene_id?: number | null;
      description?: string | null;
      name?: string;
    },
  ): Promise<any> {
    const npc = await this.repo.findOneBy({ id });
    if (!npc) throw Biz.notFound(`动态NPC ${id} 不存在`);

    if (patch.enabled != null) npc.enabled = patch.enabled;
    if (patch.status != null) {
      if (!['alive', 'dead', 'left'].includes(patch.status)) {
        throw Biz.badRequest('status 取值：alive / dead / left');
      }
      npc.status = patch.status;
    }
    if (patch.location_net_id !== undefined) npc.location_net_id = patch.location_net_id;
    if (patch.location_scene_id !== undefined) npc.location_scene_id = patch.location_scene_id;
    if (patch.description !== undefined) npc.description = patch.description;
    if (patch.name !== undefined) npc.name = patch.name;

    await this.repo.save(npc);
    return this.findOne(id);
  }

  /** 删除（物理删除；演员「退役」建议用 status=left 而非删除） */
  async remove(id: number): Promise<void> {
    const npc = await this.repo.findOneBy({ id });
    if (!npc) throw Biz.notFound(`动态NPC ${id} 不存在`);
    await this.repo.delete(id);
  }

  // ============================================================
  //  兜底随机姓名池（与 NpcService.spawnNpcForScene 保持一致风格）
  // ============================================================
  private readonly SURNAME_POOL = ['林', '苏', '萧', '古', '叶', '韩', '云', '墨', '白', '柳', '秦', '沈', '顾', '陆'];
  private readonly MALE_NAME_POOL = ['寒', '风', '霆', '渊', '烈', '铮', '川', '岳', '烽', '戈'];
  private readonly FEMALE_NAME_POOL = ['霜', '月', '婉', '绾', '璃', '芷', '瑶', '苒', '薇', '莺'];
  private readonly AGE_POOL = ['少年', '青年', '中年', '老年'];
  private randomName(female: boolean): string {
    const s = this.SURNAME_POOL[Math.floor(Math.random() * this.SURNAME_POOL.length)];
    const pool = female ? this.FEMALE_NAME_POOL : this.MALE_NAME_POOL;
    const g = pool[Math.floor(Math.random() * pool.length)];
    return s + g;
  }
}
