import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Location } from './location.entity';
import { LocationGenRule } from './location-gen-rule.entity';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';
import { MapGeneratorService } from './map-generator.service';
import { MobModule } from '../mob/mob.module';

/**
 * 地点模块（阶段 1.3 瘦身后）：
 * TrainingService 已迁出至 TrainingModule，本模块不再为训练背负
 * Player/Technique/Backpack/Item/Task/Skill/Battle 等依赖。
 * LocationService 仅需 MobService（野外节点生成时 findOrCreateBatch 魔兽）；
 * MapGeneratorService 仅依赖全局 AgentClient。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Location, LocationGenRule]), MobModule],
  controllers: [LocationController],
  providers: [LocationService, MapGeneratorService],
  exports: [LocationService],
})
export class LocationModule {}
