import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from './task.entity';
import { Player } from '../player/player.entity';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { LocationNetModule } from '../location_net/location-net.module';
import { MobModule } from '../mob/mob.module';
import { PlayerModule } from '../player/player.module';
import { AuthModule } from '../auth/auth.module';
import { AgentModule } from '../agent/agent.module';
import { ScriptModule } from '../script/script.module';
import { BackpackModule } from '../backpack/backpack.module';

/**
 * 任务模块：佣兵公会战斗任务（生成/查询/交付/放弃）。
 * TaskService 对外 export，供 training/battle 等模块调用 checkKillProgress。
 * 依赖 AgentModule：任务文案(name/description/target.desc)优先由 agent 生成，失败回退模板。
 * 依赖 ScriptModule：任务状态变更（击杀计数/接受/放弃）经 ScriptSseService 推 task_update 事件。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Task, Player]),
    LocationNetModule,
    MobModule,
    PlayerModule,
    AuthModule,
    AgentModule,
    ScriptModule,
    BackpackModule,
  ],
  providers: [TaskService],
  controllers: [TaskController],
  exports: [TaskService],
})
export class TaskModule {}
