import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PlayerService } from './player.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 玩家接口：所有 status 由后端统一计算返回。
 * 通过 JWT 识别 user，再校验 player 归属权。
 */
@Controller('player')
@UseGuards(JwtAuthGuard)
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  /** 获取玩家完整信息（含 final_attrs） GET /api/player/:id */
  @Get(':id')
  async one(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.playerService.verifyOwnership(id, req.user.id);
    const player = await this.playerService.findOne(id);
    if (!player) {
      return { error: 'not_found' };
    }
    return player;
  }

  /** 轻量状态查询（轮询用） GET /api/player/:id/status */
  @Get(':id/status')
  async status(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.playerService.verifyOwnership(id, req.user.id);
    return this.playerService.getStatus(id);
  }

  /** 修炼 POST /api/player/:id/cultivate */
  @Post(':id/cultivate')
  async cultivate(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.playerService.verifyOwnership(id, req.user.id);
    return this.playerService.cultivate(id);
  }

  /** 突破 POST /api/player/:id/breakthrough */
  @Post(':id/breakthrough')
  async breakthrough(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    await this.playerService.verifyOwnership(id, req.user.id);
    return this.playerService.breakthrough(id);
  }

  /** 切换当前地点 POST /api/player/:id/move { locationId } */
  @Post(':id/move')
  async move(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { locationId: number },
    @Req() req: any,
  ) {
    await this.playerService.verifyOwnership(id, req.user.id);
    return this.playerService.moveToLocation(id, Number(body.locationId));
  }
}
