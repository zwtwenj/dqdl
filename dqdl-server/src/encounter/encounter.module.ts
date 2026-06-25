import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Encounter } from './encounter.entity';
import { EncounterService } from './encounter.service';
import { EncounterController } from './encounter.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Encounter])],
  providers: [EncounterService],
  controllers: [EncounterController],
  exports: [EncounterService],
})
export class EncounterModule {}
