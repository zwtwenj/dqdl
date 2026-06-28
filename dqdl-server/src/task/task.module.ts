import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './task.entity';
import { Location } from '../location/location.entity';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { PlayerModule } from '../player/player.module';
import { NpcModule } from '../npc/npc.module';
import { BackpackModule } from '../backpack/backpack.module';
import { MobModule } from '../mob/mob.module';

@Module({
  imports: [TypeOrmModule.forFeature([Task, Location]), PlayerModule, NpcModule, BackpackModule, MobModule],
  controllers: [TaskController],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
