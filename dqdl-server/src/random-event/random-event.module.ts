import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventTemplate } from './event-template.entity';
import { EventInstance } from './event-instance.entity';
import { EventDispatch } from './event-dispatch.entity';
import { EventInstanceService } from './event-instance.service';
import { RandomEventController } from './random-event.controller';
import { EffectRegistry } from './effect-registry';
import { AgentOrchestrator } from './agent-orchestrator.service';
import { PlayerModule } from '../player/player.module';
import { BackpackModule } from '../backpack/backpack.module';
import { TaskModule } from '../task/task.module';
import { BattleModule } from '../battle/battle.module';
import { EncounterModule } from '../encounter/encounter.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventTemplate, EventInstance, EventDispatch]),
    PlayerModule,
    BackpackModule,
    TaskModule,
    BattleModule,
    EncounterModule,
  ],
  providers: [EventInstanceService, EffectRegistry, AgentOrchestrator],
  controllers: [RandomEventController],
  exports: [EventInstanceService, EffectRegistry],
})
export class RandomEventModule {}
