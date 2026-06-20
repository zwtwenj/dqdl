import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './task.entity';
import { Location } from '../location/location.entity';

export interface TaskTarget {
  desc: string;
  current: number;
  required: number;
}

export interface TaskReward {
  name?: string;
  count?: number;
  type?: string;  // 'money' | 'item'
  value?: number; // type=money 时的金币数量
}

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
  ) {}

  parse<T>(json: string): T[] {
    try { return JSON.parse(json); } catch { return []; }
  }

  /** 创建任务 */
  async create(
    playerId: number,
    description: string,
    target: TaskTarget[],
    reward: TaskReward[],
    type = 'common',
    delivery: object | null = null,
    star = 1,
  ): Promise<Task> {
    const task = this.taskRepo.create({
      player_id: playerId,
      description,
      target: JSON.stringify(target),
      reward: JSON.stringify(reward),
      status: 'pending',
      type,
      delivery: delivery ? JSON.stringify(delivery) : null,
      star,
    });
    return this.taskRepo.save(task);
  }

  /** 查询玩家任务 */
  async findByPlayer(playerId: number, status?: string): Promise<Task[]> {
    const where: any = { player_id: playerId };
    if (status) where.status = status;
    return this.taskRepo.find({ where, order: { id: 'DESC' } });
  }

  /** 更新目标进度 */
  async updateProgress(taskId: number, targetIndex: number, delta: number): Promise<Task | null> {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task || task.status !== 'pending') return null;

    const targets = this.parse<TaskTarget>(task.target);
    if (targetIndex < 0 || targetIndex >= targets.length) return null;

    targets[targetIndex].current = Math.min(
      targets[targetIndex].current + delta,
      targets[targetIndex].required,
    );
    task.target = JSON.stringify(targets);

    // 检查是否全部完成
    if (targets.every((t) => t.current >= t.required)) {
      task.status = 'completed';
    }

    return this.taskRepo.save(task);
  }

  /** 领取奖励 */
  async claim(taskId: number): Promise<{ task: Task; rewards: TaskReward[] } | null> {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task || task.status !== 'completed') return null;

    task.status = 'claimed';
    await this.taskRepo.save(task);

    return { task, rewards: this.parse<TaskReward>(task.reward) };
  }

  async findOne(id: number): Promise<Task | null> {
    return this.taskRepo.findOneBy({ id });
  }

  /** 生成佣兵公会战斗任务预览（不入库）
   *  返回任务数据供前端展示，玩家点击接受后才入库
   */
  async previewBattleTask(locationId: number): Promise<{
    description: string;
    target: any[];
    reward: TaskReward[];
    delivery: object;
    star: number;
  }> {
    const empire = await this.findAncestorByType(locationId, 'empire');
    if (!empire) throw new NotFoundException('当前位置未找到帝国区域，无法生成战斗任务');

    const wilds = await this.locationRepo
      .createQueryBuilder('loc')
      .where('loc.parent_id = :empireId', { empireId: empire.id })
      .andWhere('loc.loc_type = :type', { type: 'wild' })
      .andWhere('loc.danger_level > 0')
      .andWhere('loc.common_mobs IS NOT NULL')
      .getMany();

    if (wilds.length === 0) throw new NotFoundException(`${empire.name} 下暂无可用的野外区域`);

    const dangerGroups = new Map<number, Location[]>();
    for (const w of wilds) {
      const dl = w.danger_level;
      if (!dangerGroups.has(dl)) dangerGroups.set(dl, []);
      dangerGroups.get(dl)!.push(w);
    }
    const dangerLevels = Array.from(dangerGroups.keys());
    const chosenDanger = dangerLevels[Math.floor(Math.random() * dangerLevels.length)];
    const chosenWild = dangerGroups.get(chosenDanger)![Math.floor(Math.random() * dangerGroups.get(chosenDanger)!.length)];

    let mobs: { mob_id: string; name: string }[] = [];
    try { mobs = JSON.parse(chosenWild.common_mobs!); } catch { /**/ }
    if (mobs.length === 0) throw new NotFoundException(`${chosenWild.name} 没有常见怪物数据`);

    const chosenMob = mobs[Math.floor(Math.random() * mobs.length)];
    const killCount = Math.floor(Math.random() * 6) + 5;
    const dangerLabel: Record<number, string> = { 1: '一阶', 2: '二阶', 3: '三阶' };
    const star = chosenDanger; // 星级 = 危险度
    const description = `前往${empire.name} > ${chosenWild.name}，击杀${chosenMob.name}${killCount}只`;

    const target: any[] = [{
      desc: `击杀${chosenMob.name}(${dangerLabel[chosenDanger] || ''}魔兽)`,
      current: 0,
      required: killCount,
      mob_name: chosenMob.name,
      kill_count: killCount,
      location_path: [
        { id: empire.id, name: empire.name, loc_type: 'empire' },
        { id: chosenWild.id, name: chosenWild.name, loc_type: 'wild' },
      ],
    }];

    // 交付地点就是玩家当前所在的 location，直接用 locationId 构建路径
    const currentLoc = await this.locationRepo.findOneBy({ id: locationId });
    // 进一步查询并构建完整路径：从 locationId 向上追溯到 empire
    const pathNodes: { id: number; name: string; loc_type: string }[] = [];
    let cursor = currentLoc;
    while (cursor) {
      pathNodes.unshift({ id: cursor.id, name: cursor.name, loc_type: cursor.loc_type });
      if (!cursor.parent_id || cursor.loc_type === 'empire') break;
      cursor = await this.locationRepo.findOneBy({ id: cursor.parent_id });
    }
    // 查找当前地点下的 NPC
    const guildNpc = await this.locationRepo.manager
      .createQueryBuilder()
      .select(['sn.id AS id', 'sn.name AS name'])
      .from('static_npc', 'sn')
      .where('sn.location_id = :locId', { locId: locationId })
      .getRawOne();

    // 佣兵公会交付信息
    const delivery: any = {
      npc_id: guildNpc?.id ?? null,
      npc_name: guildNpc?.name ?? '佣兵公会接务员',
      location_label: pathNodes.map(n => n.name).join(' > '),
      location_path: pathNodes,
    };

    return { description, target, reward: [{ type: 'money', value: star * 10000 }], delivery, star };
  }

  /** 玩家接受佣兵公会战斗任务（入库）
   *  同时进行中 (pending) 的佣兵公会任务不超过3个
   */
  async acceptBattleTask(
    playerId: number,
    description: string,
    target: any[],
    reward: TaskReward[],
    delivery: object | null = null,
    star = 1,
  ): Promise<Task> {
    // 检查上限：计算 pending 状态的 adventurer 任务
    const pendingCount = await this.taskRepo.count({
      where: { player_id: playerId, type: 'adventurer', status: 'pending' },
    });
    if (pendingCount >= 3) {
      throw new BadRequestException('佣兵公会任务已达上限（3个），请先完成现有任务');
    }
    this.logger.log(`玩家 ${playerId} 接受任务: ${description}`);
    return this.create(playerId, description, target, reward, 'adventurer', delivery, star);
  }

  /** 向上查找指定 loc_type 的祖先节点 */
  private async findAncestorByType(
    locationId: number,
    locType: string,
  ): Promise<Location | null> {
    let current = await this.locationRepo.findOneBy({ id: locationId });
    while (current) {
      if (current.loc_type === locType) return current;
      if (!current.parent_id) break;
      current = await this.locationRepo.findOneBy({ id: current.parent_id });
    }
    return null;
  }

  /**
   * 历练击杀魔兽后，检查玩家的 pending 任务中有无匹配目标
   * 匹配则 current+1。达到 required 后任务不再自动改 completed，等待玩家交付
   * @returns 被更新的任务列表（含进度信息）
   */
  async checkAndUpdateProgress(
    playerId: number,
    mobName: string,
  ): Promise<{ taskId: number; description: string; current: number; required: number; done: boolean }[]> {
    const pendingTasks = await this.taskRepo.find({
      where: { player_id: playerId, status: 'pending' },
    });
    const updated: { taskId: number; description: string; current: number; required: number; done: boolean }[] = [];

    for (const task of pendingTasks) {
      const targets = this.parse<TaskTarget & { mob_name?: string }>(task.target);
      let changed = false;
      for (const tgt of targets) {
        if (tgt.mob_name === mobName && tgt.current < tgt.required) {
          tgt.current += 1;
          changed = true;
        }
      }
      if (!changed) continue;

      task.target = JSON.stringify(targets);
      // 达标后保持 pending 状态，等玩家手动前往佣兵公会交付
      const allDone = targets.every(t => t.current >= t.required);
      await this.taskRepo.save(task);

      const mainTarget = targets[0];
      updated.push({
        taskId: task.id,
        description: task.description,
        current: mainTarget?.current ?? 0,
        required: mainTarget?.required ?? 0,
        done: allDone,
      });
    }
    return updated;
  }

  /**
   * 玩家交付：将指定 NPC 关联的、已达标的 pending 任务改为 completed
   * 同时发放 reward 中的金币奖励
   * @param playerId 玩家 ID
   * @param npcId 与之对话的 NPC ID（匹配 delivery.npc_id）
   * @returns 完成的任务列表
   */
  async completeReadyTasks(playerId: number, npcId?: number): Promise<Task[]> {
    const pendingTasks = await this.taskRepo.find({
      where: { player_id: playerId, status: 'pending' },
    });
    const completedTasks: Task[] = [];
    let totalMoney = 0;

    for (const task of pendingTasks) {
      const targets = this.parse<TaskTarget>(task.target);
      const allDone = targets.length > 0 && targets.every(t => t.current >= t.required);
      if (!allDone) continue;

      // 如果传入了 npcId，过滤只交付 delivery.npc_id 匹配的任务
      if (npcId !== undefined && npcId !== null) {
        let delivery: any = null;
        try { delivery = task.delivery ? JSON.parse(task.delivery) : null; } catch { /**/ }
        if (!delivery || Number(delivery.npc_id) !== Number(npcId)) continue;
      }

      task.status = 'completed';
      await this.taskRepo.save(task);
      completedTasks.push(task);

      // 累加金币奖励
      const rewards = this.parse<TaskReward>(task.reward);
      for (const r of rewards) {
        if (r.type === 'money' && r.value) {
          totalMoney += r.value;
        }
      }
    }

    // 一次性发放金币
    if (totalMoney > 0) {
      await this.locationRepo.manager
        .createQueryBuilder()
        .update('player', { money: () => `money + ${totalMoney}` })
        .where('id = :id', { id: playerId })
        .execute();
      this.logger.log(`玩家 ${playerId} 获得任务奖励金币: ${totalMoney}`);
    }

    return completedTasks;
  }
}