import { Controller, Get, Post, Param, Query, ParseIntPipe } from '@nestjs/common';
import { EncounterService } from './encounter.service';

@Controller('encounter')
export class EncounterController {
  constructor(private readonly encounterService: EncounterService) {}

  /** 玩家可见奇遇列表（pending 未进入 + entered 进行中） */
  @Get()
  list(@Query('playerId', ParseIntPipe) playerId: number) {
    return this.encounterService.findVisible(playerId);
  }

  /** 放弃奇遇 */
  @Post(':id/abandon')
  async abandon(
    @Param('id', ParseIntPipe) id: number,
    @Query('playerId', ParseIntPipe) playerId: number,
  ) {
    await this.encounterService.abandon(id, playerId);
    return { ok: true };
  }
}
