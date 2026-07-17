import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaticNpc } from './static-npc.entity';
import { Nature } from './nature.entity';
import { NpcRole } from './npc-role.entity';
import { DialogSession } from './dialog-session.entity';
import { DialogEvent } from './dialog-event.entity';
import { DynamicNpc } from './dynamic-npc.entity';
import { NpcService } from './npc.service';
import { NpcController } from './npc.controller';
import { DynamicNpcService } from './dynamic-npc.service';
import { DynamicNpcController } from './dynamic-npc.controller';
import { AuthModule } from '../auth/auth.module';
import { AgentModule } from '../agent/agent.module';
import { PlayerModule } from '../player/player.module';
import { LocationModule } from '../location/location.module';

/**
 * NPC 模块：对话核心（查询 + 对话）+ 动态演员池。
 * NpcService 对外 export，供其它业务模块注入（如送信、随机事件兜售等后续原子）。
 * DynamicNpcService 对外 export，供剧情/奇遇/副本等模块 acquire 演员。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([StaticNpc, Nature, NpcRole, DialogSession, DialogEvent, DynamicNpc]),
    AuthModule,
    AgentModule,
    PlayerModule,
    LocationModule,
  ],
  providers: [NpcService, DynamicNpcService],
  // controllers 注册顺序即路由匹配顺序：字面量路由（dynamic/actor/role）须先于
  // NpcController 的 @Get(':id') 注册，否则 GET /npc/dynamic 会被 :id='dynamic' 抢先命中。
  controllers: [DynamicNpcController, NpcController],
  exports: [NpcService, DynamicNpcService],
})
export class NpcModule {}
