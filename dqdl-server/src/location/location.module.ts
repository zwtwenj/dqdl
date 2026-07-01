import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Location } from './location.entity';
import { LocationGenRule } from './location-gen-rule.entity';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';
import { MapGeneratorService } from './map-generator.service';
import { MobModule } from '../mob/mob.module';
import { ItemModule } from '../item/item.module';

/**
 * 地点模块（阶段 1.3 瘦身后）：
 * TrainingService 已迁出至 TrainingModule，本模块不再为训练背负
 * Player/Technique/Backpack/Task/Skill/Battle 等依赖。
 * LocationService 仅需 MobService（野外节点生成时 findOrCreateBatch 魔兽）与
 * ItemService（野外节点生成时按 danger_level 填充常见药草 gather_herbs）；
 * MapGeneratorService 仅依赖全局 AgentClient。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Location, LocationGenRule]), MobModule, ItemModule],
  controllers: [LocationController],
  providers: [LocationService, MapGeneratorService],
  exports: [LocationService],
})
export class LocationModule {}
