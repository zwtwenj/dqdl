import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { StoryService } from './story.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlayerService } from '../player/player.service';

/**
 * 故事事件接口。
 *
 * 前缀 /api/story
 *   GET /current  玩家当前进行中的事件（含当前节点信息）。
 *                 无 → { ok: true, event: null }；有 → { ok: true, event: {...} }。
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
}
