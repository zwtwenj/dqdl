import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Training } from './training.entity';
import { TrainingLog } from './training-log.entity';
import { TrainingService } from './training.service';
import { TrainingController } from './training.controller';
import { PlayerModule } from '../player/player.module';
import { LocationNetModule } from '../location_net/location-net.module';
import { AgentModule } from '../agent/agent.module';
import { MobModule } from '../mob/mob.module';
import { BackpackModule } from '../backpack/backpack.module';
import { ItemModule } from '../item/item.module';
import { EncounterModule } from '../encounter/encounter.module';
import { TechniqueModule } from '../technique/technique.module';
import { SkillModule } from '../skill/skill.module';
import { TaskModule } from '../task/task.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Training, TrainingLog]),
    PlayerModule,
    LocationNetModule,
    AgentModule,
    MobModule,
    BackpackModule,
    ItemModule,
    EncounterModule,
    TechniqueModule,
    SkillModule,
    TaskModule,
    AuthModule,
  ],
  providers: [TrainingService],
  controllers: [TrainingController],
})
export class TrainingModule {}
