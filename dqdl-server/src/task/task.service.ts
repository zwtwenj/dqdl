import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './task.entity';

export interface TaskTarget {
  desc: string;
  current: number;
  required: number;
}

export interface TaskReward {
  name: string;
  count: number;
}

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,
  ) {}

  parse<T>(json: string): T[] {
    try { return JSON.parse(json); } catch { return []; }
  }

  /** 创建任务 */
  async create(playerId: number, description: string, target: TaskTarget[], reward: TaskReward[]): Promise<Task> {
    const task = this.taskRepo.create({
      player_id: playerId,
      description,
      target: JSON.stringify(target),
      reward: JSON.stringify(reward),
      status: 'pending',
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
}
