import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards, Req } from '@nestjs/common';
import { SaveService } from './save.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface RequestUser {
  user: { id: number; username: string };
}

@Controller('save')
@UseGuards(JwtAuthGuard)
export class SaveController {
  constructor(private readonly saveService: SaveService) {}

  /** 列出当前账号的所有存档 GET /api/save */
  @Get()
  list(@Req() req: RequestUser) {
    return this.saveService.listByUser(req.user.id);
  }

  /** 创建新存档 POST /api/save { name?, content? } */
  @Post()
  create(
    @Req() req: RequestUser,
    @Body() body: { name?: string; content?: Record<string, any> },
  ) {
    return this.saveService.create(req.user.id, body.name, body.content);
  }

  /** 更新存档内容（存进度） PATCH /api/save/:slot { content } */
  @Patch(':slot')
  update(
    @Req() req: RequestUser,
    @Param('slot', ParseIntPipe) slot: number,
    @Body() body: { content: Record<string, any> },
  ) {
    return this.saveService.updateContent(req.user.id, slot, body.content);
  }

  /** 重命名存档 PATCH /api/save/:slot/name { name } */
  @Patch(':slot/name')
  rename(
    @Req() req: RequestUser,
    @Param('slot', ParseIntPipe) slot: number,
    @Body() body: { name: string },
  ) {
    return this.saveService.rename(req.user.id, slot, body.name);
  }

  /** 删除存档 DELETE /api/save/:slot */
  @Delete(':slot')
  async remove(
    @Req() req: RequestUser,
    @Param('slot', ParseIntPipe) slot: number,
  ) {
    await this.saveService.remove(req.user.id, slot);
    return { ok: true };
  }
}
