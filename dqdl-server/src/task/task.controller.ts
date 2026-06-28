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
      delivery: t.delivery ? JSON.parse(t.delivery) : null,
    }));
  }

  /** 创建任务 */
  @Post()
  async create(
    @Body() body: { player_id: number; name?: string; description: string; target: any[]; reward: any[] },
  ) {
    const task = await this.taskService.create(
      body.player_id,
      body.name || '任务',
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

  /** 接受锻造委托（生成材料收集任务，交付锻造师，奖励黑铁剑） */
  @Post('forge/accept')
  async acceptForge(@Body() body: { player_id: number; location_id: number }) {
    const task = await this.taskService.acceptForgeTask(Number(body.player_id), Number(body.location_id));
    return {
      ...task,
      target: this.taskService.parse(task.target),
      reward: this.taskService.parse(task.reward),
      delivery: task.delivery ? JSON.parse(task.delivery) : null,
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

  /** 生成随机任务预览（不入库） */
  @Post('generate')
  async generateTask(
    @Body() body: { location_id: number },
  ) {
    const preview = await this.taskService.previewBattleTask(body.location_id);
    return {
      ...preview,
      // target 已是对象数组，直接返回
    };
  }

  /** 玩家接受任务（入库） */
  @Post('accept')
  async acceptTask(
    @Body() body: { player_id: number; name?: string; description: string; target: any[]; reward: any[]; delivery?: any; star?: number },
  ) {
    const task = await this.taskService.acceptBattleTask(
      body.player_id,
      body.name || '猎杀魔兽',
      body.description,
      body.target,
      body.reward || [],
      body.delivery || null,
      body.star || 1,
    );
    return {
      ...task,
      target: this.taskService.parse(task.target),
      reward: this.taskService.parse(task.reward),
      delivery: task.delivery ? JSON.parse(task.delivery) : null,
    };
  }

  /** 玩家交付：将指定 NPC 关联的、达标的 pending 任务改为 completed */
  @Post('complete-adventurer')
  async completeAdventurer(@Body() body: { player_id: number; npc_id?: number }) {
    const tasks = await this.taskService.completeReadyTasks(body.player_id, body.npc_id);
    return {
      count: tasks.length,
      tasks: tasks.map(t => ({
        ...t,
        target: this.taskService.parse(t.target),
        reward: this.taskService.parse(t.reward),
        delivery: t.delivery ? JSON.parse(t.delivery) : null,
      })),
    };
  }
}
