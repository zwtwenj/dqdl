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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EncounterService } from './encounter.service';
import { PlayerService, PLAYER_STATUS } from '../player/player.service';
import { DungeonInstance } from '../dungeon/dungeon-instance.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 奇遇接口：玩家可见奇遇列表（pending + entered）+ 放弃奇遇。
 * 通过 JWT 识别 user → 校验 player 归属权。
 *
 * 放弃 entered 态奇遇时联动：把进行中的秘境实例标记 escaped + 玩家状态复位 IDLE，
 * 避免出现"奇遇已放弃但玩家卡在秘境中"的孤儿状态。
 */
@Controller('encounter')
@UseGuards(JwtAuthGuard)
export class EncounterController {
  constructor(
    private readonly encounterService: EncounterService,
    private readonly playerService: PlayerService,
    @InjectRepository(DungeonInstance)
    private readonly dungeonRepo: Repository<DungeonInstance>,
  ) {}

  /** 玩家可见奇遇列表（pending 未进入 + entered 进行中）GET /api/encounter */
  @Get()
  async list(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.encounterService.findVisible(player.id);
  }

  /** 放弃奇遇（pending / entered 都可放弃）POST /api/encounter/:id/abandon */
  @Post(':id/abandon')
  async abandon(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    // 放弃前先查原状态，判断是否 entered（需联动清理秘境+复位玩家）
    const enc = await this.encounterService.findOne(id, player.id);
    const affected = await this.encounterService.abandon(id, player.id);
    if (affected > 0 && enc && enc.status === 'entered') {
      // 联动：把该玩家进行中的秘境实例标记为 escaped（若有）
      await this.dungeonRepo.update(
        { player_id: player.id, status: 'active' },
        { status: 'escaped' },
      );
      // 玩家状态复位（若正卡在秘境/洞天福地修炼中）
      if (player.status === PLAYER_STATUS.DUNGEON || player.status === PLAYER_STATUS.CULTIVATING) {
        await this.playerService.setStatus(player.id, PLAYER_STATUS.IDLE);
      }
    }
    return this.encounterService.findVisible(player.id);
  }
}
