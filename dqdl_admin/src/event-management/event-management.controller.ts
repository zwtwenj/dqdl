import { Controller, Get, Post, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { EventManagementService } from './event-management.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 事件管理接口。
 *
 *   GET  /api/events/list?page=1&size=20&keyword=   事件列表（story_event 分页）
 *   GET  /api/events/:id                            事件详情（含 nodes JSON）
 *   POST /api/events/generate                       生成新事件（转发 dqdl-agent）
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class EventManagementController {
  constructor(private readonly events: EventManagementService) {}

  /** GET /api/events/list */
  @Get('events/list')
  list(
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.events.list(Number(page) || 1, Number(size) || 20, keyword?.trim() || undefined);
  }

  /** GET /api/events/:id */
  @Get('events/:id')
  async detail(@Param('id', ParseIntPipe) id: number) {
    const row = await this.events.detail(id);
    if (!row) return { ok: false, msg: '事件不存在' };
    return { ok: true, event: row };
  }

  /** POST /api/events/:id/trigger-config  保存事件触发配置 { config: { trigger, params, probability } | null } */
  @Post('events/:id/trigger-config')
  async saveTriggerConfig(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { config?: any },
  ) {
    const ok = await this.events.saveTriggerConfig(id, body.config ?? null);
    if (!ok) return { ok: false, msg: '事件不存在' };
    return { ok: true };
  }

  /** POST /api/events/:id/connect-config  保存某条连线配置 { edge: "src->tgt", config: { event, task } | null } */
  @Post('events/:id/connect-config')
  async saveConnectConfig(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { edge?: string; config?: any },
  ) {
    if (!body?.edge) return { ok: false, msg: '缺少 edge 参数' };
    const cfgs = await this.events.saveConnectConfig(id, body.edge, body.config ?? null);
    if (!cfgs) return { ok: false, msg: '事件不存在' };
    return { ok: true, connect_configs: cfgs };
  }

  /** POST /api/events/generate */
  @Post('events/generate')
  generate(@Body() body: { prompt?: string }) {
    return this.events.generate(body?.prompt);
  }
}
