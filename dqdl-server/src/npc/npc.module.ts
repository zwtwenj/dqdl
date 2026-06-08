import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaticNpc } from './static-npc.entity';
import { Nature } from './nature.entity';
import { NpcRole } from './npc-role.entity';
import { DialogEvent } from './dialog-event.entity';
import { Location } from '../location/location.entity';
import { NpcService } from './npc.service';
import { NpcController } from './npc.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StaticNpc, Nature, NpcRole, DialogEvent, Location])],
  controllers: [NpcController],
  providers: [NpcService],
  exports: [NpcService],
})
export class NpcModule {}
