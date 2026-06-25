import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CultivationSession } from './cultivation_session.entity';
import { CultivationService } from './cultivation.service';
import { CultivationController } from './cultivation.controller';
import { PlayerModule } from '../player/player.module';
import { EncounterModule } from '../encounter/encounter.module';

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
