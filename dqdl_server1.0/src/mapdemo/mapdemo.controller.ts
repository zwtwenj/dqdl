import { Controller, Get, Post, Param, ParseIntPipe, Body } from '@nestjs/common';
import { MapDemoService } from './mapdemo.service';

/**
 * 网状地图 DEMO 接口（无需鉴权，方便直接打开页面看效果）
 *
 * 与现有 location 接口的对照：
 *   GET  /mapdemo/graph              ← 取代全树：返回网状 { nodes, edges }
 *   GET  /mapdemo/:id                ← 单节点
 *   GET  /mapdemo/:id/exits          ← 取代 children+siblings：出口列表（含 unknown 桩）
 *   POST /mapdemo/:id/expand         ← 取代 expandNode：拓展前沿，body { direction? }
 *   POST /mapdemo/reset              ← 重置内存地图（demo 调试用）
 */
@Controller('mapdemo')
export class MapDemoController {
  constructor(private readonly svc: MapDemoService) {}

  /** 全图（节点+边），前端画力导向图 */
  @Get('graph')
  graph() {
    return this.svc.graph();
  }

  /** 单节点 */
  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number) {
    return this.svc.node(id);
  }

  /** 出口列表（open/blocked/unknown 都返回） */
  @Get(':id/exits')
  exits(@Param('id', ParseIntPipe) id: number) {
    return this.svc.exits(id);
  }

  /** 拓展前沿：把一个 unknown 桩变成一片新地点 + 边。body 可选 { direction: 'W' } */
  @Post(':id/expand')
  expand(@Param('id', ParseIntPipe) id: number, @Body() body?: { direction?: string }) {
    return this.svc.expandFrontier(id, body?.direction);
  }
}
