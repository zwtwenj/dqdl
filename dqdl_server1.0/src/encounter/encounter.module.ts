import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Encounter } from './encounter.entity';
import { EncounterService } from './encounter.service';
import { EncounterController } from './encounter.controller';
import { AuthModule } from '../auth/auth.module';
import { PlayerModule } from '../player/player.module';

/**
 * 奇遇模块：历练中发现副本入口/洞天福地，入玩家奇遇列表。
 * 列表/放弃接口对外；触发(tryGenerate) 由 TrainingModule 调用。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Encounter]), AuthModule, PlayerModule],
  providers: [EncounterService],
  controllers: [EncounterController],
  exports: [EncounterService],
})
export class EncounterModule {}
