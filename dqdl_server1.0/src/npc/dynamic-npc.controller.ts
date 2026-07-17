import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { DynamicNpcService, AcquireActorDto } from './dynamic-npc.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 动态 NPC 演员池接口。
 *
 * 路由分组（都在 /api/npc 下，与 NpcController 同前缀，但路径段为非数字，
 * 不会与 NpcController 的 @Get(':id')（ParseIntPipe）冲突）：
 *   POST   /api/npc/actor/acquire   选角：查找或创建（Agent/业务单入口）
 *   POST   /api/npc/role            创建/确保职业存在（Agent 造职业能力）
 *   GET    /api/npc/dynamic         列表（分页+过滤）
 *   GET    /api/npc/dynamic/:id     详情
 *   PATCH  /api/npc/dynamic/:id     启停/移动/状态/描述
 *   DELETE /api/npc/dynamic/:id     删除
 *
 * 注意：地点可见演员查询走 NpcController 的 GET /api/npc/location/:id
 * （后端已合并返回 { static, dynamic }，无需单独接口）。
 */
@Controller('npc')
@UseGuards(JwtAuthGuard)
export class DynamicNpcController {
  constructor(private readonly dynamicNpcService: DynamicNpcService) {}

  // ── 选角：查找或创建 ──
  @Post('actor/acquire')
  acquire(@Body() dto: AcquireActorDto) {
    return this.dynamicNpcService.acquire(dto);
  }

  // ── 职业：创建/确保存在 ──
  @Post('role')
  ensureRole(@Body() body: { name: string; prompt_hint?: string }) {
    return this.dynamicNpcService.ensureRole(body.name, body.prompt_hint);
  }

  // ── 动态演员 CRUD ──
  @Get('dynamic')
  list(
    @Query('role_id') roleId?: string,
    @Query('enabled') enabled?: string,
    @Query('status') status?: string,
    @Query('net_id') netId?: string,
    @Query('scene_id') sceneId?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.dynamicNpcService.list({
      role_id: roleId ? Number(roleId) : undefined,
      enabled: enabled == null || enabled === '' ? undefined : Number(enabled),
      status: status || undefined,
      net_id: netId ? Number(netId) : undefined,
      scene_id: sceneId ? Number(sceneId) : undefined,
      page: page ? Number(page) : undefined,
      size: size ? Number(size) : undefined,
    });
  }

  @Get('dynamic/:id')
  one(@Param('id', ParseIntPipe) id: number) {
    return this.dynamicNpcService.findOne(id);
  }

  @Patch('dynamic/:id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      enabled?: number;
      status?: string;
      location_net_id?: number | null;
      location_scene_id?: number | null;
      description?: string | null;
      name?: string;
    },
  ) {
    return this.dynamicNpcService.update(id, body);
  }

  @Delete('dynamic/:id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.dynamicNpcService.remove(id);
    return { ok: true };
  }
}
