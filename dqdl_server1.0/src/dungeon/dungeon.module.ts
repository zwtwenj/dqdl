import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DungeonInstance } from './dungeon-instance.entity';
import { DungeonService } from './dungeon.service';
import { DungeonController } from './dungeon.controller';
import { PlayerModule } from '../player/player.module';
import { MobModule } from '../mob/mob.module';
import { ItemModule } from '../item/item.module';
import { AgentModule } from '../agent/agent.module';
import { EncounterModule } from '../encounter/encounter.module';
import { LocationNetModule } from '../location_net/location-net.module';
import { AuthModule } from '../auth/auth.module';

/**
 * 秘境模块：AI 生成五幕蓝图 + 按难度装配 + 逐幕推进 + 刷新恢复。
 * 本次第一期：只做编排闭环。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DungeonInstance]),
    PlayerModule,
    MobModule,
    ItemModule,
    AgentModule,
    EncounterModule,
    LocationNetModule,
    AuthModule,
  ],
  providers: [DungeonService],
  controllers: [DungeonController],
  exports: [DungeonService],
})
export class DungeonModule {}
