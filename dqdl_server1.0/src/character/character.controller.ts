import { Controller, Get, Post, Delete, Param, ParseIntPipe, Body, UseGuards, Req } from '@nestjs/common';
import { CharacterService } from './character.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestUser {
  user: { id: number; username: string };
}

/**
 * 角色接口（网游模式）。
 *   GET    /api/character           列出当前账号的所有角色
 *   POST   /api/character           创建角色 { name }
 *   DELETE /api/character/:slot     删除角色
 */
@Controller('character')
@UseGuards(JwtAuthGuard)
export class CharacterController {
  constructor(private readonly characterService: CharacterService) {}

  @Get()
  list(@Req() req: RequestUser) {
    return this.characterService.listByUser(req.user.id)
  }

  @Post()
  create(@Req() req: RequestUser, @Body() body: { name: string }) {
    return this.characterService.create(req.user.id, body.name || '无名')
  }

  @Delete(':slot')
  async remove(@Req() req: RequestUser, @Param('slot', ParseIntPipe) slot: number) {
    await this.characterService.remove(req.user.id, slot)
    return { ok: true }
  }
}
