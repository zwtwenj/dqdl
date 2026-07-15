import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationNet } from './location-net.entity';
import { LocationScene } from './location-scene.entity';
import { Player } from '../player/player.entity';
import { LocationNetService } from './location-net.service';
import { LocationNetController } from './location-net.controller';
import { AuthModule } from '../auth/auth.module';
import { PlayerModule } from '../player/player.module';
import { AgentModule } from '../agent/agent.module';
import { NpcModule } from '../npc/npc.module';

/**
 * 网状地图 + 场景 模块。
 * 已接入真实游戏流程：接口加 JwtAuthGuard，用 verifyOwnershipByUser 取真实玩家。
 * 地图生成走 agent（DeepSeek），失败降级到名称池。
 * 城市新场景创建后会回调 NpcService 补齐"必生 NPC"（佣兵工会→公会接待员 等）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([LocationNet, LocationScene, Player]),
    AuthModule,
    PlayerModule,
    AgentModule,
    NpcModule,
  ],
  providers: [LocationNetService],
  controllers: [LocationNetController],
  exports: [LocationNetService],
})
export class LocationNetModule {}
