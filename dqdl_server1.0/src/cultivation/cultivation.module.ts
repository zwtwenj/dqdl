import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CultivationSession } from './cultivation-session.entity';
import { CultivationService } from './cultivation.service';
import { CultivationController } from './cultivation.controller';
import { PlayerModule } from '../player/player.module';
import { EncounterModule } from '../encounter/encounter.module';

/**
 * 洞天福地修炼模块。
 *
 * 由 encounter(kind='cultivate') 触发，玩家进入后 SSE 流定时结算修为。
 * 依赖 PlayerModule（cultivate + 状态管理）和 EncounterModule（消耗/完成奇遇）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CultivationSession]),
    PlayerModule,
    EncounterModule,
  ],
  providers: [CultivationService],
  controllers: [CultivationController],
  exports: [CultivationService],
})
export class CultivationModule {}
