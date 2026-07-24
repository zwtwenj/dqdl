import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { MoveSessionService } from './move-session.service';
import { PlayerService } from '../player/player.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 移动接口（速度/时间机制）。
 *   GET  /api/move/preview/:toNetId  预览移动时间（前端确认弹窗用）
 *   POST /api/move/start/:toNetId    开始移动（创建 session + 锁状态）
 *   POST /api/move/cancel            取消移动（恢复 IDLE）
 *   GET  /api/move/current           查当前移动 session（刷新恢复用）
 *   POST /api/move/arrive            到达结算（改 location_id + 恢复 IDLE）
 */
@Controller('move')
@UseGuards(JwtAuthGuard)
export class MoveController {
  constructor(
    private readonly moveService: MoveSessionService,
    private readonly playerService: PlayerService,
  ) {}

  /** 预览移动时间 GET /api/move/preview/:toNetId */
  @Get('preview/:toNetId')
  async preview(
    @Param('toNetId', ParseIntPipe) toNetId: number,
    @Req() req: any,
  ) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.moveService.preview(player.id, toNetId);
  }

  /** 开始移动 POST /api/move/start/:toNetId → session */
  @Post('start/:toNetId')
  async start(
    @Param('toNetId', ParseIntPipe) toNetId: number,
    @Req() req: any,
  ) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.moveService.startMove(player.id, toNetId);
  }

  /** 取消移动 POST /api/move/cancel */
  @Post('cancel')
  async cancel(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    await this.moveService.cancelMove(player.id);
    return { ok: true };
  }

  /** 查当前移动 GET /api/move/current → session | null */
  @Get('current')
  async current(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.moveService.getActiveSession(player.id);
  }

  /** 到达结算 POST /api/move/arrive → { session, to_net_id } */
  @Post('arrive')
  async arrive(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.moveService.arrive(player.id);
  }
}
