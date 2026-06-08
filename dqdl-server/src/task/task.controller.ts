import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { TaskService } from './task.service';

@Controller('task')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  /** 查询玩家任务列表 */
  @Get('player/:playerId')
  async findByPlayer(
    @Param('playerId') playerId: number,
    @Body() body?: { status?: string },
  ) {
    const tasks = await this.taskService.findByPlayer(playerId, body?.status);
    return tasks.map((t) => ({
      ...t,
      target: this.taskService.parse(t.target),
      reward: this.taskService.parse(t.reward),
    }));
  }

  /** 创建任务 */
  @Post()
  async create(
    @Body() body: { player_id: number; description: string; target: any[]; reward: any[] },
  ) {
    const task = await this.taskService.create(
      body.player_id,
      body.description,
      body.target,
      body.reward,
    );
    return {
      ...task,
      target: this.taskService.parse(task.target),
      reward: this.taskService.parse(task.reward),
    };
  }

  /** 更新进度 */
  @Post(':id/progress')
  async updateProgress(
    @Param('id') id: number,
    @Body() body: { targetIndex: number; delta: number },
  ) {
    const task = await this.taskService.updateProgress(id, body.targetIndex, body.delta || 1);
    if (!task) return { error: '任务不存在或已完成' };
    return {
      ...task,
      target: this.taskService.parse(task.target),
      reward: this.taskService.parse(task.reward),
    };
  }

  /** 领取奖励 */
  @Post(':id/claim')
  async claim(@Param('id') id: number) {
    const result = await this.taskService.claim(id);
    if (!result) return { error: '任务未完成或已领取' };
    return {
      ...result.task,
      target: this.taskService.parse(result.task.target),
      reward: result.rewards,
    };
  }
}
