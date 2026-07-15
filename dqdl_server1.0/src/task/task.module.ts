import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './task.entity';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { LocationNetModule } from '../location_net/location-net.module';
import { MobModule } from '../mob/mob.module';
import { PlayerModule } from '../player/player.module';
import { AuthModule } from '../auth/auth.module';

/**
 * 任务模块：佣兵公会战斗任务（生成/查询/交付）。
 * TaskService 对外 export，供 training/battle 等模块调用 checkKillProgress。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    LocationNetModule,
    MobModule,
    PlayerModule,
    AuthModule,
  ],
  providers: [TaskService],
  controllers: [TaskController],
  exports: [TaskService],
})
export class TaskModule {}
