import { Controller, Post, Delete, Get, Body, Param, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { GameService } from './game.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlayerService } from '../player/player.service';

interface RequestUser {
  user: { id: number; username: string };
}

/**
 * 游戏入口接口（网游模式）。
 *   POST   /api/game/create         创建角色 { name }
 *   POST   /api/game/enter/:slot    进入角色（返回含 pending_states）
 *   GET    /api/game/pending-states 查询玩家进行中的事件（刷新页面恢复用）
 *   DELETE /api/game/delete/:slot   删除角色
 */
@Controller('game')
@UseGuards(JwtAuthGuard)
export class GameController {
  constructor(
    private readonly game: GameService,
    private readonly playerService: PlayerService,
  ) {}

  /** 创建角色 POST /api/game/create { name } */
  @Post('create')
  createCharacter(@Req() req: RequestUser, @Body() body: { name: string }) {
    return this.game.createCharacter(req.user.id, body.name || '无名')
  }

  /** 进入角色 POST /api/game/enter/:slot（返回含 pending_states 进行中事件） */
  @Post('enter/:slot')
  enterCharacter(
    @Req() req: RequestUser,
    @Param('slot', ParseIntPipe) slot: number,
  ) {
    return this.game.enterCharacter(req.user.id, slot)
  }

  /**
   * 查询玩家进行中的事件（刷新页面恢复用）。
   * 返回 [{type, data}]：剧本(script)/修炼(cultivation) 等，前端按 type 分发恢复。
   * 复用 enterCharacter 的 collectPendingStates 逻辑。
   */
  @Get('pending-states')
  async getPendingStates(@Req() req: RequestUser) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.game.getPendingStates(player.id);
  }

  /** 删除角色 DELETE /api/game/delete/:slot */
  @Delete('delete/:slot')
  async deleteCharacter(
    @Req() req: RequestUser,
    @Param('slot', ParseIntPipe) slot: number,
  ) {
    await this.game.deleteCharacter(req.user.id, slot)
    return { ok: true }
  }
}
