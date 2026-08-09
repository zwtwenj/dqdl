import { Controller, Get, Post, Body, Param, Req, UseGuards, ParseIntPipe } from '@nestjs/common';
import { StoryService } from './story.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlayerService } from '../player/player.service';

/**
 * 故事事件接口。
 *
 * 前缀 /api/story
 *   GET  /current                   玩家当前进行中的事件（含当前节点信息）。
 *                                   无 → { ok: true, event: null }；有 → { ok: true, event: {...} }。
 *   POST /instance/:id/advance      推进（点继续/选择）：body { goto? }。
 *                                   连线配置为发布任务时返回 { ok, result: 'task_issued', task_id }。
 *
 * 约定：同一时间一个玩家只能触发一个事件（见 StoryService.getCurrentEvent）。
 */
@Controller('story')
@UseGuards(JwtAuthGuard)
export class StoryController {
  constructor(
    private readonly storyService: StoryService,
    private readonly playerService: PlayerService,
  ) {}

  @Get('current')
  async getCurrent(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    const event = await this.storyService.getCurrentEvent(player.id);
    return { ok: true, event };
  }

  /** 推进：POST /api/story/instance/:id/advance  body: { goto?: string } */
  @Post('instance/:id/advance')
  async advance(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { goto?: string },
    @Req() req: any,
  ) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    const result = await this.storyService.advance(id, player.id, body?.goto);
    return { ok: true, ...result };
  }
}
