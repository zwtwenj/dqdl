import { Module } from '@nestjs/common';
import { TrainingService } from './training.service';
import { TrainingController } from './training.controller';
import { PlayerModule } from '../player/player.module';
import { MobModule } from '../mob/mob.module';
import { TechniqueModule } from '../technique/technique.module';
import { LocationModule } from '../location/location.module';
import { BackpackModule } from '../backpack/backpack.module';
import { ItemModule } from '../item/item.module';
import { TaskModule } from '../task/task.module';
import { SkillModule } from '../skill/skill.module';
import { BattleModule } from '../battle/battle.module';

/**
 * 历练模块（阶段 1.3 从 location/ 提升）。
 * 显式声明训练对 player/mob/technique/location/backpack/item/task/skill/battle 的依赖，
 * 让原本隐藏在 LocationModule 里的"编排型"耦合有独立归属。
 * AgentClient 由全局 AgentModule 提供，无需在此声明。
 */
@Module({
  imports: [
    PlayerModule,
    MobModule,
    TechniqueModule,
    LocationModule,
    BackpackModule,
    ItemModule,
    TaskModule,
    SkillModule,
    BattleModule,
  ],
  controllers: [TrainingController],
  providers: [TrainingService],
})
export class TrainingModule {}
