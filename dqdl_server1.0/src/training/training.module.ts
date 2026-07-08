import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Training } from './training.entity';
import { TrainingLog } from './training-log.entity';
import { TrainingService } from './training.service';
import { TrainingController } from './training.controller';
import { PlayerModule } from '../player/player.module';
import { LocationModule } from '../location/location.module';
import { AgentModule } from '../agent/agent.module';
import { MobModule } from '../mob/mob.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Training, TrainingLog]),
    PlayerModule,
    LocationModule,
    AgentModule,
    MobModule,
    AuthModule,
  ],
  providers: [TrainingService],
  controllers: [TrainingController],
})
export class TrainingModule {}
