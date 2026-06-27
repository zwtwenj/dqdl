import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DialogEvent } from '../npc/dialog-event.entity';
import { NpcModule } from '../npc/npc.module';
import { TaskModule } from '../task/task.module';
import { PlayerModule } from '../player/player.module';
import { DialogEventService } from './dialog-event.service';
import { DialogEventController } from './dialog-event.controller';

@Module({
  // 独立模块：同时依赖 NpcModule / TaskModule（TaskModule 已 import NpcModule，故本模块单向依赖，无循环）
  imports: [
    TypeOrmModule.forFeature([DialogEvent]),
    NpcModule,
    TaskModule,
    PlayerModule,
  ],
  controllers: [DialogEventController],
  providers: [DialogEventService],
})
export class DialogEventModule {}
