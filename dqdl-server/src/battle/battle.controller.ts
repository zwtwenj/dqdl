import { Controller, Post, Get, Body, Param, ParseIntPipe } from '@nestjs/common';
import { BattleService } from './battle.service';
import { BattleSeeder } from './battle.seed';

@Controller('battle')
export class BattleController {
  constructor(
    private readonly battleService: BattleService,
    private readonly battleSeeder: BattleSeeder,
  ) {}

  /** 开战 { playerId, mobId } */
  @Post('start')
  async start(@Body() body: { playerId: number; mobId: string }) {
    return this.battleService.start(Number(body.playerId), body.mobId);
  }

  /** 行动 { playerId, type: normal|skill|flee, slot? } */
  @Post('action')
  async action(@Body() body: { playerId: number; type: 'normal' | 'skill' | 'flee'; slot?: number }) {
    return this.battleService.action(Number(body.playerId), body);
  }

  /** 当前快照 */
  @Get('state/:playerId')
  async state(@Param('playerId', ParseIntPipe) playerId: number) {
    return this.battleService.getState(playerId);
  }

  /** 清空重建 buff / buff_effect / skill 实验数据 */
  @Post('seed')
  async seed() {
    return this.battleSeeder.seed();
  }

  /** 给所有玩家重置默认 5 技能 */
  @Post('equip-all')
  async equipAll() {
    return this.battleSeeder.equipAllDefaults();
  }
}
