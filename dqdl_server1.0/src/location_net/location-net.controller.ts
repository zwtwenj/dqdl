import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { LocationNetService } from './location-net.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlayerService } from '../player/player.service';

/**
 * 网状地图 + 场景 接口（已接入真实游戏流程）。
 * 通过 JWT 识别 user → verifyOwnershipByUser 查 player → 操作位置（范式 B，与 battle/training 一致）。
 *
 * 前缀 /api/location_net
 *   GET  /graph                      全图（节点 + 对角邻接边）
 *   GET  /pos                        当前位置（地图 + 场景）
 *   GET  /view                       玩家视野：ring0+ring1 可见 + ring2 迷雾
 *   GET  /:id                        单节点
 *   GET  /:id/scenes                 该地图的场景列表
 *   GET  /:id/exits                  出口（4 对角方向：open + unknown 桩）
 *   POST /:id/expand                 拓展前沿  body { direction?: 'NE'|'NW'|'SE'|'SW' }
 *
 * 玩家位置（真实玩家，从 JWT 推导）：
 *   POST /move/:netId                移动到相邻地图节点（带 ring1 自动生成）
 *   POST /:netId/scene/:sceneType/enter   进入场景
 *   POST /scene/exit                 退出场景
 */
@Controller('location_net')
@UseGuards(JwtAuthGuard)
export class LocationNetController {
  constructor(
    private readonly svc: LocationNetService,
    private readonly playerService: PlayerService,
  ) {}

  // ---------- 地图数据 ----------
  @Get('graph')
  graph() {
    return this.svc.getGraph();
  }

  @Get('pos')
  async pos(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.svc.getPlayerPos(player.id);
  }

  /** 玩家视野：ring0 + ring1（可见）+ ring2（迷雾）。GameView 画地图主用这个 */
  @Get('view')
  async view(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.svc.getPlayerView(player.id);
  }

  @Get(':id')
  one(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getNode(id);
  }

  @Get(':id/scenes')
  scenes(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getScenes(id);
  }

  @Get(':id/exits')
  exits(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getExits(id);
  }

  @Post(':id/expand')
  expand(@Param('id', ParseIntPipe) id: number, @Body() body?: { direction?: string }) {
    return this.svc.expandFrontier(id, body?.direction);
  }

  // ---------- 玩家位置（真实玩家） ----------
  @Post('move/:netId')
  async move(@Param('netId', ParseIntPipe) netId: number, @Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.svc.movePlayer(player.id, netId);
  }

  @Post(':netId/scene/:sceneType/enter')
  async enterScene(
    @Param('netId', ParseIntPipe) netId: number,
    @Param('sceneType') sceneType: string,
    @Req() req: any,
  ) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.svc.enterScene(player.id, netId, sceneType);
  }

  @Post('scene/exit')
  async exitScene(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.svc.exitScene(player.id);
  }
}
