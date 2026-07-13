import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  ParseIntPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import { EncounterService } from './encounter.service';
import { PlayerService } from '../player/player.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 奇遇接口：玩家可见奇遇列表（pending + entered）+ 放弃奇遇。
 * 通过 JWT 识别 user → 校验 player 归属权。
 */
@Controller('encounter')
@UseGuards(JwtAuthGuard)
export class EncounterController {
  constructor(
    private readonly encounterService: EncounterService,
    private readonly playerService: PlayerService,
  ) {}

  /** 玩家可见奇遇列表（pending 未进入 + entered 进行中）GET /api/encounter */
  @Get()
  async list(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.encounterService.findVisible(player.id);
  }

  /** 放弃奇遇（仅 pending）POST /api/encounter/:id/abandon */
  @Post(':id/abandon')
  async abandon(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    await this.encounterService.abandon(id, player.id);
    return this.encounterService.findVisible(player.id);
  }
}
