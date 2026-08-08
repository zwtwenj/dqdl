import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoveSession } from './move-session.entity';
import { LocationNet } from '../location_net/location-net.entity';
import { Player } from '../player/player.entity';
import { MoveSessionService } from './move-session.service';
import { MoveController } from './move.controller';
import { AuthModule } from '../auth/auth.module';
import { PlayerModule } from '../player/player.module';
import { ScriptModule } from '../script/script.module';

/**
 * 移动模块：基于速度/时间的移动系统。
 * MoveSessionService 对外 export，供 pending_states / game.service 恢复用。
 * 引入 ScriptModule 是为了用 ScriptSseService（通用 SSE 推送通道）：
 * 玩家到达目的地时推送 move_arrived 事件给前端。
 * 到达新地图时 emit 'enter_map' 钩子（SCRIPT_HOOK_EVENT），由 story/script 触发服务监听。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MoveSession, LocationNet, Player]),
    AuthModule,
    PlayerModule,
    ScriptModule,
  ],
  providers: [MoveSessionService],
  controllers: [MoveController],
  exports: [MoveSessionService],
})
export class MoveModule {}
