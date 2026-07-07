import { Controller, Post, Delete, Body, Param, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { GameService } from './game.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestUser {
  user: { id: number; username: string };
}

/**
 * 游戏入口接口（网游模式）。
 *   POST /api/game/create         创建角色 { name }
 *   POST /api/game/enter/:slot    进入角色
 *   DELETE /api/game/delete/:slot 删除角色
 */
@Controller('game')
@UseGuards(JwtAuthGuard)
export class GameController {
  constructor(private readonly game: GameService) {}

  /** 创建角色 POST /api/game/create { name } */
  @Post('create')
  createCharacter(@Req() req: RequestUser, @Body() body: { name: string }) {
    return this.game.createCharacter(req.user.id, body.name || '无名')
  }

  /** 进入角色 POST /api/game/enter/:slot */
  @Post('enter/:slot')
  enterCharacter(
    @Req() req: RequestUser,
    @Param('slot', ParseIntPipe) slot: number,
  ) {
    return this.game.enterCharacter(req.user.id, slot)
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
