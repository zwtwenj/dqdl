import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { TaskService } from './task.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlayerService } from '../player/player.service';

/**
 * 任务接口。
 *
 * 前缀 /api/task
 *   POST /adventurer/preview   预览佣兵任务（生成草稿 draft 落库，返回 taskId）
 *   POST /adventurer/accept    接受草稿（draft → pending）
 *   POST /adventurer/reject    拒绝/换一个草稿（draft → delete）
 *   GET  /mine                 查我的进行中任务（JWT 取玩家）
 *   GET  /mine/:playerId       同上（兼容前端显式传参）
 *   GET  /:id                  查单条任务详情（任务详情弹窗用）
 *   POST /:id/claim            交付任务领奖
 *
 * playerId 优先取 body.playerId；若走 JWT 真实玩家则从 user 推导。
 * 这里用 body.playerId + JwtAuthGuard 双保险（前端从 URL query 带了 playerId）。
 */
@Controller('task')
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly playerService: PlayerService,
  ) {}

  /** 预览佣兵任务候选（不入库） */
  @Post('adventurer/preview')
  async preview(@Body() body: { playerId?: number }, @Req() req: any) {
    const playerId = body.playerId ?? (await this.playerService.verifyOwnershipByUser(req.user.id)).id;
    return this.taskService.previewAdventurerTask(playerId);
  }

  /** 接受草稿任务（draft → pending） */
  @Post('adventurer/accept')
  async accept(@Body() body: { playerId?: number; taskId?: number }, @Req() req: any) {
    const playerId = body.playerId ?? (await this.playerService.verifyOwnershipByUser(req.user.id)).id;
    if (!body.taskId) return { ok: false, msg: '缺少 taskId' };
    return this.taskService.acceptAdventurerTask(playerId, body.taskId);
  }

  /** 拒绝/换一个草稿任务（draft → delete） */
  @Post('adventurer/reject')
  async reject(@Body() body: { playerId?: number; taskId?: number }, @Req() req: any) {
    const playerId = body.playerId ?? (await this.playerService.verifyOwnershipByUser(req.user.id)).id;
    if (!body.taskId) return { ok: false, msg: '缺少 taskId' };
    return this.taskService.rejectTask(playerId, body.taskId);
  }

  /** 查我的进行中任务 */
  @Get('mine')
  async mine(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.taskService.findMyTasks(player.id);
  }

  /** 也可显式按 playerId 查（兼容前端 query 传参） */
  @Get('mine/:playerId')
  async mineByPlayer(@Param('playerId', ParseIntPipe) playerId: number) {
    return this.taskService.findMyTasks(playerId);
  }

  /** 查单条任务详情（任务详情弹窗用，校验归属，draft/pending 都能查） */
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const playerId = await this.playerService.verifyOwnershipByUser(req.user.id).then(p => p.id);
    return this.taskService.findOneTask(playerId, id);
  }

  /** 交付任务领奖 */
  @Post(':id/claim')
  async claim(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { playerId?: number },
    @Req() req: any,
  ) {
    const playerId = body.playerId ?? (await this.playerService.verifyOwnershipByUser(req.user.id)).id;
    return this.taskService.claimTask(playerId, id);
  }
}
