import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { DungeonService } from './dungeon.service';
import { PlayerService } from '../player/player.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 秘境接口：进入/查询当前/推进/撤退。
 * 通过 JWT 识别 user → 校验 player 归属权。
 * 本次第一期：只做编排闭环（生成蓝图+逐幕推进+恢复）。
 */
@Controller('dungeon')
@UseGuards(JwtAuthGuard)
export class DungeonController {
  constructor(
    private readonly dungeonService: DungeonService,
    private readonly playerService: PlayerService,
  ) {}

  /** 进入/生成秘境 POST /api/dungeon/enter { encounterId? } */
  @Post('enter')
  async enter(@Body() body: { encounterId?: number }, @Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.dungeonService.enter(player.id, body.encounterId);
  }

  /** 查当前进行中的秘境（刷新恢复用）GET /api/dungeon/current */
  @Get('current')
  async current(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.dungeonService.getCurrent(player.id);
  }

  /** 推进下一幕（最后一幕则通关）POST /api/dungeon/next */
  @Post('next')
  async next(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.dungeonService.next(player.id);
  }

  /** 撤退秘境 POST /api/dungeon/escape */
  @Post('escape')
  async escape(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.dungeonService.escape(player.id);
  }

  /** 战斗胜利：标记当前幕已击败 + 掉落进临时背包 POST /api/dungeon/win */
  @Post('win')
  async win(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.dungeonService.winAct(player.id);
  }

  /** 战斗失败：整个秘境失败 POST /api/dungeon/fail */
  @Post('fail')
  async fail(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.dungeonService.fail(player.id);
  }
}
