import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CultivationSession } from './cultivation-session.entity';
import { CultivationService } from './cultivation.service';
import { CultivationController } from './cultivation.controller';
import { PlayerModule } from '../player/player.module';
import { EncounterModule } from '../encounter/encounter.module';
import { ScriptModule } from '../script/script.module';

/**
 * 洞天福地修炼模块。
 *
 * 由 encounter(kind='cultivate') 触发，玩家进入后定时器结算修为，经通用 SSE 推送。
 * 依赖 PlayerModule（cultivate + 状态管理）、EncounterModule（消耗/完成奇遇）、
 * ScriptModule（修炼结算经 ScriptSseService 推 cultivation_settle 事件）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CultivationSession]),
    PlayerModule,
    EncounterModule,
    ScriptModule,
  ],
  providers: [CultivationService],
  controllers: [CultivationController],
  exports: [CultivationService],
})
export class CultivationModule {}
