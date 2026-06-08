import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Location } from './location.entity';
import { LocationGenRule } from './location-gen-rule.entity';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';
import { MapGeneratorService } from './map-generator.service';
import { TrainingService } from './training.service';
import { MobModule } from '../mob/mob.module';
import { PlayerModule } from '../player/player.module';
import { TechniqueModule } from '../technique/technique.module';

@Module({
  imports: [TypeOrmModule.forFeature([Location, LocationGenRule]), MobModule, PlayerModule, TechniqueModule],
  controllers: [LocationController],
  providers: [LocationService, MapGeneratorService, TrainingService],
  exports: [LocationService],
})
export class LocationModule {}
