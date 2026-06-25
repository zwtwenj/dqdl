import { Controller, Get, Post, Query, Body, ParseIntPipe, NotFoundException } from '@nestjs/common';
import { DungeonService } from './dungeon.service';

@Controller('dungeon')
export class DungeonController {
  constructor(private readonly dungeonService: DungeonService) {}

  /** 进入/生成副本（可由奇遇进入，传 encounterId） */
  @Post('enter')
  enter(
    @Query('playerId', ParseIntPipe) playerId: number,
    @Query('encounterId') encounterId?: string,
  ) {
    const eid = encounterId ? Number(encounterId) : NaN;
    return this.dungeonService.enter(playerId, Number.isFinite(eid) ? eid : undefined);
  }

  /** 获取当前进行中的副本状态 */
  @Get('current')
  async current(@Query('playerId', ParseIntPipe) playerId: number) {
    const inst = await this.dungeonService.getCurrent(playerId);
    if (!inst) throw new NotFoundException('没有进行中的副本');
    return this.dungeonService.enrich(inst);
  }

  /** 推进到下一幕（最后一幕则通关） */
  @Post('next')
  next(@Query('playerId', ParseIntPipe) playerId: number) {
    return this.dungeonService.next(playerId);
  }

  /** 拾取当前物品幕的奖励 */
  @Post('pick')
  pick(@Query('playerId', ParseIntPipe) playerId: number) {
    return this.dungeonService.pick(playerId);
  }

  /** 使用副本临时背包中的物品 */
  @Post('use')
  use(
    @Query('playerId', ParseIntPipe) playerId: number,
    @Body() body: { name: string },
  ) {
    return this.dungeonService.useTempItem(playerId, body?.name);
  }

  /** 撤退：放弃副本 */
  @Post('escape')
  escape(@Query('playerId', ParseIntPipe) playerId: number) {
    return this.dungeonService.escape(playerId);
  }

  /** 战斗失败：放弃副本 */
  @Post('fail')
  fail(@Query('playerId', ParseIntPipe) playerId: number) {
    return this.dungeonService.fail(playerId);
  }

  /** 战斗胜利掉落：掉落进副本临时背包 */
  @Post('loot')
  loot(@Query('playerId', ParseIntPipe) playerId: number) {
    return this.dungeonService.loot(playerId);
  }
}
