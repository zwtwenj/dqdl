import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaticNpc } from './static-npc.entity';
import { Nature } from './nature.entity';
import { NpcRole } from './npc-role.entity';
import { DialogSession } from './dialog-session.entity';
import { NpcService } from './npc.service';
import { NpcController } from './npc.controller';
import { AuthModule } from '../auth/auth.module';
import { AgentModule } from '../agent/agent.module';
import { PlayerModule } from '../player/player.module';
import { LocationModule } from '../location/location.module';

/**
 * NPC 模块：对话核心（查询 + 对话）。
 * NpcService 对外 export，供其它业务模块注入（如送信、随机事件兜售等后续原子）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([StaticNpc, Nature, NpcRole, DialogSession]),
    AuthModule,
    AgentModule,
    PlayerModule,
    LocationModule,
  ],
  providers: [NpcService],
  controllers: [NpcController],
  exports: [NpcService],
})
export class NpcModule {}
