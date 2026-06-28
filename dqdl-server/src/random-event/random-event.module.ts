import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RandomEvent } from './random-event.entity';
import { RandomEventLog } from './random-event-log.entity';
import { RandomEventService } from './random-event.service';
import { RandomEventController } from './random-event.controller';
import { PlayerModule } from '../player/player.module';
import { BackpackModule } from '../backpack/backpack.module';
import { TaskModule } from '../task/task.module';

@Module({
  imports: [TypeOrmModule.forFeature([RandomEvent, RandomEventLog]), PlayerModule, BackpackModule, TaskModule],
  providers: [RandomEventService],
  controllers: [RandomEventController],
  exports: [RandomEventService],
})
export class RandomEventModule {}
