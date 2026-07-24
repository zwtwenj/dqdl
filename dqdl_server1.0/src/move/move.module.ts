import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoveSession } from './move-session.entity';
import { LocationNet } from '../location_net/location-net.entity';
import { Player } from '../player/player.entity';
import { MoveSessionService } from './move-session.service';
import { MoveController } from './move.controller';
import { AuthModule } from '../auth/auth.module';
import { PlayerModule } from '../player/player.module';

/**
 * 移动模块：基于速度/时间的移动系统。
 * MoveSessionService 对外 export，供 pending_states / game.service 恢复用。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MoveSession, LocationNet, Player]),
    AuthModule,
    PlayerModule,
  ],
  providers: [MoveSessionService],
  controllers: [MoveController],
  exports: [MoveSessionService],
})
export class MoveModule {}
